import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentDefinition } from "metabase/apps/types";
import { Paper } from "metabase/ui";

type Props = {
  component: ComponentDefinition;
  ChildComponent: React.ComponentType<{ component: ComponentDefinition }>;
  childComponentProps?: any;
};

export function CardSystemComponent({
  component,
  ChildComponent,
  childComponentProps,
}: Props) {
  const child = component.children?.[0];
  return (
    <Paper
      bg={getComponentStyleValue(component, "backgroundColor")}
      radius={getComponentStyleValue(component, "borderRadius")}
      p={getComponentStyleValue(component, "padding")}
      bd="1px solid var(--mb-color-border)"
    >
      {child && (
        <ChildComponent
          parentComponent={component}
          component={child}
          {...childComponentProps}
        />
      )}
    </Paper>
  );
}
