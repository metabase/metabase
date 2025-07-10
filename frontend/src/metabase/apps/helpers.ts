import { SYSTEM_COMPONENTS_MAP } from "./const/systemComponents";
import type { ComponentDefinition } from "./types";

export function getComponentStyleValue(
  component: ComponentDefinition,
  styleKey: string,
): any {
  return (
    component.style?.[styleKey] ??
    SYSTEM_COMPONENTS_MAP[component.componentId].styleVariables?.find(
      (variable) => variable.key === styleKey,
    )?.defaultValue ??
    undefined
  );
}

export const TRAVERSE_STOP = Symbol("traverse-stop");

export function traverseComponentTree(
  component: ComponentDefinition,
  callback: (
    component: ComponentDefinition,
  ) => typeof TRAVERSE_STOP | undefined,
) {
  const toVisit = [component];
  while (toVisit.length > 0) {
    const currentNode = toVisit.shift();
    if (currentNode) {
      const flag = callback(currentNode);

      if (flag === TRAVERSE_STOP) {
        break;
      }

      if (currentNode.children) {
        toVisit.push(...currentNode.children);
      }
    }
  }
}
