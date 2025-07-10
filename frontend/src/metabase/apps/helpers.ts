import { SYSTEM_COMPONENTS_MAP } from "./const/systemComponents";
import type { ComponentDefinition } from "./types";

export function getComponentStyleValue(
  component: ComponentDefinition,
  styleKey: string,
): any {
  return (
    component.style?.[styleKey] ??
    SYSTEM_COMPONENTS_MAP[component.componentId].defaultStyle?.[styleKey]
  );
}
