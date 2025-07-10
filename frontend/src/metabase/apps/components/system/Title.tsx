import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentDefinition } from "metabase/apps/types";
import { Title } from "metabase/ui";

type Props = {
  component: ComponentDefinition;
};

export function TitleSystemComponent({ component }: Props) {
  return (
    <Title
      order={getComponentStyleValue(component, "order")}
      c={getComponentStyleValue(component, "color")}
    >
      {component.value?.value}
    </Title>
  );
}
