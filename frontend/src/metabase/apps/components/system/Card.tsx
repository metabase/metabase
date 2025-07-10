import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentDefinition } from "metabase/apps/types";
import { Paper } from "metabase/ui";

type Props = {
  component: ComponentDefinition;
};

export function CardSystemComponent({ component }: Props) {
  return (
    <Paper
      bg={getComponentStyleValue(component, "backgroundColor")}
      radius={getComponentStyleValue(component, "borderRadius")}
      p={getComponentStyleValue(component, "padding")}
      bd={getComponentStyleValue(component, "border")}
    >
      {component.name}
    </Paper>
  );
}
