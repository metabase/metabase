import { getComponentStyleValue } from "metabase/apps/helpers";
import { Group } from "metabase/ui";

import type { ComponentDefinition } from "../../types";
import { ComponentTreeNode } from "../ComponentTreeNode";

type Props = {
  component: ComponentDefinition;
  ChildComponent?: React.ComponentType<any>;
  childComponentProps?: any;
};

export function GroupSystemComponent({
  component,
  ChildComponent = ComponentTreeNode,
  childComponentProps,
}: Props) {
  return (
    <Group
      gap={getComponentStyleValue(component, "gap")}
      p={getComponentStyleValue(component, "padding")}
    >
      {component.children?.map((child) => (
        <ChildComponent
          key={child.id}
          component={child}
          parentComponent={component}
          {...childComponentProps}
        />
      ))}
    </Group>
  );
}
