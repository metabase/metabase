import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { useComponentValue } from "metabase/apps/hooks/use-component-value";
import type {
  ComponentConfiguration,
  ComponentDefinition,
} from "metabase/apps/types";
import { Button } from "metabase/ui";

type Props = {
  componentContext: ComponentContext;
  configuration: ComponentConfiguration;
  component: ComponentDefinition;
};

export function ButtonSystemComponent({ componentContext, component }: Props) {
  const value = useComponentValue(component, componentContext, "Button");
  return (
    <Button
      color={getComponentStyleValue(component, "color")}
      variant={getComponentStyleValue(component, "variant")}
      size={getComponentStyleValue(component, "size")}
      radius={getComponentStyleValue(component, "radius")}
    >
      {value}
    </Button>
  );
}
