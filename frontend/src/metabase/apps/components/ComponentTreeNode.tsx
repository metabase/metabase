import { Text } from "metabase/ui";

import { SystemComponentId } from "../const/systemComponents";
import type { ComponentDefinition } from "../types";

import { CardSystemComponent } from "./system/Card";
import { TextSystemComponent } from "./system/Text";
import { TitleSystemComponent } from "./system/Title";

type Props = {
  component: ComponentDefinition;
  ChildComponent?: React.ComponentType<any>;
  childComponentProps?: any;
};

export function ComponentTreeNode({
  component,
  ChildComponent = ComponentTreeNode,
  childComponentProps,
}: Props) {
  switch (component.componentId) {
    case SystemComponentId.Title:
      return <TitleSystemComponent component={component} />;

    case SystemComponentId.Text:
      return <TextSystemComponent component={component} />;

    case SystemComponentId.Card:
      return (
        <CardSystemComponent
          component={component}
          ChildComponent={ChildComponent}
          childComponentProps={childComponentProps}
        />
      );

    default:
      return <Text>{component.componentId}</Text>;
  }
}
