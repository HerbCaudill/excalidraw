import {
  NonDeletedExcalidrawElement,
  ExcalidrawLinearElement,
  NonDeleted,
  PointBinding,
  ExcalidrawBindableElement,
} from "./types";
import { getCommonBounds } from "./bounds";
import { mutateElement } from "./mutateElement";
import { SHAPES } from "../shapes";
import { getPerfectElementSize } from "./sizeHelpers";
import { globalSceneState } from "../scene";
import { LinearElementEditor } from "./linearElementEditor";
import { distanceBetweenPoints, translatePointAlongLine } from "../math";
import { intersectElementWithLine } from "./collision";
import { Point } from "../types";

export const dragSelectedElements = (
  selectedElements: NonDeletedExcalidrawElement[],
  pointerX: number,
  pointerY: number,
) => {
  const [x1, y1] = getCommonBounds(selectedElements);
  const offset = { x: pointerX - x1, y: pointerY - y1 };
  selectedElements.forEach((element) => {
    mutateElement(element, {
      x: element.x + offset.x,
      y: element.y + offset.y,
    });
    updateBoundElementsOnDrag(element, offset);
  });
};

const updateBoundElementsOnDrag = (
  draggedElement: NonDeletedExcalidrawElement,
  offset: { x: number; y: number },
) => {
  (globalSceneState.getNonDeletedElements(
    draggedElement.boundElementIds ?? [],
  ) as NonDeleted<ExcalidrawLinearElement>[]).forEach((boundElement) => {
    maybeMoveBoundPoint(
      boundElement,
      "start",
      boundElement.startBinding,
      draggedElement as ExcalidrawBindableElement,
      offset,
    );
    maybeMoveBoundPoint(
      boundElement,
      "end",
      boundElement.endBinding,
      draggedElement as ExcalidrawBindableElement,
      offset,
    );
  });
};

export const getDragOffsetXY = (
  selectedElements: NonDeletedExcalidrawElement[],
  x: number,
  y: number,
): [number, number] => {
  const [x1, y1] = getCommonBounds(selectedElements);
  return [x - x1, y - y1];
};

export const dragNewElement = (
  draggingElement: NonDeletedExcalidrawElement,
  elementType: typeof SHAPES[number]["value"],
  originX: number,
  originY: number,
  x: number,
  y: number,
  width: number,
  height: number,
  isResizeWithSidesSameLength: boolean,
  isResizeCenterPoint: boolean,
) => {
  if (isResizeWithSidesSameLength) {
    ({ width, height } = getPerfectElementSize(
      elementType,
      width,
      y < originY ? -height : height,
    ));

    if (height < 0) {
      height = -height;
    }
  }

  let newX = x < originX ? originX - width : originX;
  let newY = y < originY ? originY - height : originY;

  if (isResizeCenterPoint) {
    width += width;
    height += height;
    newX = originX - width / 2;
    newY = originY - height / 2;
  }

  if (width !== 0 && height !== 0) {
    mutateElement(draggingElement, {
      x: newX,
      y: newY,
      width: width,
      height: height,
    });
  }
};

const maybeMoveBoundPoint = (
  boundElement: NonDeleted<ExcalidrawLinearElement>,
  startOrEnd: "start" | "end",
  binding: PointBinding | null | undefined,
  draggedElement: ExcalidrawBindableElement,
  offset: { x: number; y: number },
): void => {
  if (binding?.elementId === draggedElement.id) {
    moveBoundPoint(boundElement, startOrEnd, binding, draggedElement, offset);
  }
};

const moveBoundPoint = (
  linearElement: NonDeleted<ExcalidrawLinearElement>,
  startOrEnd: "start" | "end",
  binding: PointBinding,
  draggedElement: ExcalidrawBindableElement,
  offset: { x: number; y: number },
): void => {
  const direction = startOrEnd === "start" ? -1 : 1;
  const edgePointIndex = direction === -1 ? 0 : linearElement.points.length - 1;
  const adjacentPointIndex = edgePointIndex - direction;
  // The linear element was not originally pointing inside the bound shape,
  // we use simple binding without focus points
  if (binding.gap === 0) {
    LinearElementEditor.movePointByOffset(
      linearElement,
      edgePointIndex,
      offset,
    );
    return;
  }
  const adjacentPoint = LinearElementEditor.getPointAtIndexGlobalCoordinates(
    linearElement,
    adjacentPointIndex,
  );
  const draggedFocusPointAbsolute: Point = [
    draggedElement.x + binding.focusPoint[0] + offset.x,
    draggedElement.y + binding.focusPoint[1] + offset.y,
  ];

  const intersections = intersectElementWithLine(
    draggedElement,
    adjacentPoint,
    draggedFocusPointAbsolute,
  );
  if (intersections.length === 0) {
    // TODO: This should never happen, but it does due to scaling/rotating
    return;
  }
  // Guaranteed to intersect because focusPoint is always inside the shape
  const [intersection1, intersection2] = intersections;
  const nearIntersection =
    distanceBetweenPoints(intersection1, adjacentPoint) <
    distanceBetweenPoints(intersection2, adjacentPoint)
      ? intersection1
      : intersection2;
  const newEdgePoint = translatePointAlongLine(
    nearIntersection,
    binding.gap,
    adjacentPoint,
  );
  LinearElementEditor.movePoint(
    linearElement,
    edgePointIndex,
    LinearElementEditor.pointFromAbsoluteCoords(linearElement, newEdgePoint),
  );
};
