import { Text } from "metabase/ui";

import { SystemComponentId } from "../const/systemComponents";
import { getComponentById } from "../hooks/use-apps";
import type { ComponentContext } from "../hooks/use-component-context";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { CardSystemComponent } from "./system/Card";
import { GroupSystemComponent } from "./system/Group";
import { IconSystemComponent } from "./system/Icon";
import { ListSystemComponent } from "./system/List";
import { StackSystemComponent } from "./system/Stack";
import { TextSystemComponent } from "./system/Text";
import { TitleSystemComponent } from "./system/Title";

type Props = {
  configuration: ComponentConfiguration;
  componentContext: ComponentContext;
  parentComponent?: ComponentDefinition;
  component: ComponentDefinition;
  ChildComponent?: React.ComponentType<any>;
  childComponentProps?: any;
};

export function ComponentTreeNode({
  configuration,
  componentContext,
  component,
  ChildComponent = ComponentTreeNode,
  childComponentProps,
}: Props) {
  if (!component.componentId.startsWith("system:")) {
    const customComponent = getComponentById(component.componentId);
    if (customComponent) {
      return (
        <ComponentTreeNode
          configuration={customComponent}
          componentContext={componentContext}
          component={customComponent.root}
          ChildComponent={ChildComponent}
          childComponentProps={childComponentProps}
        />
      );
    }
  }

  switch (component.componentId) {
    case SystemComponentId.Title:
      return (
        <TitleSystemComponent
          component={component}
          componentContext={componentContext}
        />
      );

    case SystemComponentId.Text:
      return (
        <TextSystemComponent
          component={component}
          componentContext={componentContext}
        />
      );

    case SystemComponentId.Icon:
      return <IconSystemComponent component={component} />;

    case SystemComponentId.Stack:
      return (
        <StackSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
          ChildComponent={ChildComponent}
          childComponentProps={childComponentProps}
        />
      );

    case SystemComponentId.Group:
      return (
        <GroupSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
          ChildComponent={ChildComponent}
          childComponentProps={childComponentProps}
        />
      );

    case SystemComponentId.Card:
      return (
        <CardSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
          ChildComponent={ChildComponent}
          childComponentProps={childComponentProps}
        />
      );

    case SystemComponentId.List:
      return (
        <ListSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
        />
      );

    default:
      return <Text>{component.componentId}</Text>;
  }
}
