import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentDefinition } from "metabase/apps/types";
import { Text } from "metabase/ui";

type Props = {
  component: ComponentDefinition;
};

export function TextSystemComponent({ component }: Props) {
  return (
    <Text
      size={getComponentStyleValue(component, "size")}
      fw={getComponentStyleValue(component, "bold") ? "bold" : "normal"}
      fs={getComponentStyleValue(component, "italic") ? "italic" : "normal"}
      td={
        getComponentStyleValue(component, "underline") ? "underline" : "normal"
      }
      c={getComponentStyleValue(component, "color")}
    >
      {component.value?.value}
    </Text>
  );
}
