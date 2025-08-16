import { getComponentStyleValue } from "metabase/apps/helpers";
import type { ComponentContext } from "metabase/apps/hooks/use-component-context";
import { Group } from "metabase/ui";

import type { ComponentConfiguration, ComponentDefinition } from "../../types";
import { ComponentTreeNode } from "../ComponentTreeNode";

type Props = {
  configuration: ComponentConfiguration;
  componentContext: ComponentContext;
  component: ComponentDefinition;
  ChildComponent?: React.ComponentType<any>;
  childComponentProps?: any;
};

export function GroupSystemComponent({
  configuration,
  componentContext,
  component,
  ChildComponent = ComponentTreeNode,
  childComponentProps,
}: Props) {
  return (
    <Group
      gap={getComponentStyleValue(component, "gap")}
      p={getComponentStyleValue(component, "padding")}
      align={getComponentStyleValue(component, "align")}
      justify={getComponentStyleValue(component, "justify")}
    >
      {component.children?.map((child) => (
        <ChildComponent
          key={child.id}
          configuration={configuration}
          componentContext={componentContext}
          component={child}
          parentComponent={component}
          {...childComponentProps}
        />
      ))}
    </Group>
  );
}
