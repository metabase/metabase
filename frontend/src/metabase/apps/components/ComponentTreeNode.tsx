import { Text } from "metabase/ui";

import { SystemComponentId } from "../const/systemComponents";
import { getComponentById } from "../hooks/use-apps";
import type { ComponentContext } from "../hooks/use-component-context";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { BadgeSystemComponent } from "./system/Badge";
import { ButtonSystemComponent } from "./system/Button";
import { CardSystemComponent } from "./system/Card";
import { GroupSystemComponent } from "./system/Group";
import { IconSystemComponent } from "./system/Icon";
import { ListSystemComponent } from "./system/List";
import { StackSystemComponent } from "./system/Stack";
import { TextSystemComponent } from "./system/Text";
import { TextInputSystemComponent } from "./system/TextInput";
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
          parentComponent={component}
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

    case SystemComponentId.Badge:
      return (
        <BadgeSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
        />
      );

    case SystemComponentId.TextInput:
      return (
        <TextInputSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
        />
      );

    case SystemComponentId.Button:
      return (
        <ButtonSystemComponent
          configuration={configuration}
          componentContext={componentContext}
          component={component}
        />
      );
    default:
      return <Text>{component.componentId}</Text>;
  }
}
