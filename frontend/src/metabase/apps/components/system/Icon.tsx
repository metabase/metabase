import { getComponentStyleValue } from "metabase/apps/helpers";
import { Icon } from "metabase/ui";

import type { ComponentDefinition } from "../../types";

type Props = {
  component: ComponentDefinition;
};

export function IconSystemComponent({ component }: Props) {
  return (
    <Icon
      name={getComponentStyleValue(component, "icon")}
      size={getComponentStyleValue(component, "size")}
      color={getComponentStyleValue(component, "color")}
    />
  );
}
