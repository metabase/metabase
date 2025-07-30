import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { useComponentValue } from "metabase/apps/hooks/use-component-value";
import type { ComponentDefinition } from "metabase/apps/types";
import { Text } from "metabase/ui";

type Props = {
  componentContext: ComponentContext;
  component: ComponentDefinition;
};

export function TextSystemComponent({ component, componentContext }: Props) {
  const value = useComponentValue(component, componentContext, "Text");

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
      {value}
    </Text>
  );
}
