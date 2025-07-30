import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { useComponentValue } from "metabase/apps/hooks/use-component-value";
import type {
  ComponentConfiguration,
  ComponentDefinition,
} from "metabase/apps/types";
import { Badge } from "metabase/ui";

type Props = {
  componentContext: ComponentContext;
  configuration: ComponentConfiguration;
  component: ComponentDefinition;
};

export function BadgeSystemComponent({ componentContext, component }: Props) {
  const value = useComponentValue(component, componentContext, "Badge");
  return (
    <Badge
      radius={getComponentStyleValue(component, "radius")}
      variant={getComponentStyleValue(component, "variant")}
      color={getComponentStyleValue(component, "color")}
      size={getComponentStyleValue(component, "size")}
    >
      {value}
    </Badge>
  );
}
