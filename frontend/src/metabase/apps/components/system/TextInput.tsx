import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { useComponentValue } from "metabase/apps/hooks/use-component-value";
import type {
  ComponentConfiguration,
  ComponentDefinition,
} from "metabase/apps/types";
import { TextInput } from "metabase/ui";

type Props = {
  componentContext: ComponentContext;
  configuration: ComponentConfiguration;
  component: ComponentDefinition;
};

export function TextInputSystemComponent({
  componentContext,
  component,
}: Props) {
  const value = useComponentValue(component, componentContext);
  return (
    <TextInput
      label={getComponentStyleValue(component, "label")}
      size={getComponentStyleValue(component, "size")}
      variant={getComponentStyleValue(component, "variant")}
      radius={getComponentStyleValue(component, "radius")}
      color={getComponentStyleValue(component, "color")}
      placeholder={getComponentStyleValue(component, "placeholder")}
      defaultValue={value}
    />
  );
}
