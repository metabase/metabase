import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import type { ComponentDefinition } from "metabase/apps/types";

export function useComponentValue(
  component: ComponentDefinition,
  componentContext: ComponentContext,
  defaultValue?: string,
) {
  let value = defaultValue;

  switch (component.value?.type) {
    case "constant":
      if (component.value.value) {
        value = component.value.value;
      }
      break;

    case "context":
      if (component.value.field) {
        value =
          componentContext.value[component.value.field]?.toString() ?? value;
      }
      break;
  }

  return value;
}
