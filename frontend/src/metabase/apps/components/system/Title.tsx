import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { useComponentValue } from "metabase/apps/hooks/use-component-value";
import type { ComponentDefinition } from "metabase/apps/types";
import { Title } from "metabase/ui";

type Props = {
  componentContext: ComponentContext;
  component: ComponentDefinition;
};

export function TitleSystemComponent({ component, componentContext }: Props) {
  const value = useComponentValue(component, componentContext, "Title");

  return (
    <Title
      order={getComponentStyleValue(component, "order")}
      c={getComponentStyleValue(component, "color")}
    >
      {value}
    </Title>
  );
}
