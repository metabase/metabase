import { Text } from "metabase/ui";

import { SystemComponentId } from "../const/systemComponents";
import type { ComponentDefinition } from "../types";

import { CardSystemComponent } from "./system/Card";
import { TextSystemComponent } from "./system/Text";
import { TitleSystemComponent } from "./system/Title";

type Props = {
  component: ComponentDefinition;
};

export function ComponentTreeNode({ component }: Props) {
  switch (component.componentId) {
    case SystemComponentId.Title:
      return <TitleSystemComponent component={component} />;

    case SystemComponentId.Text:
      return <TextSystemComponent component={component} />;

    case SystemComponentId.Card:
      return <CardSystemComponent component={component} />;

    default:
      return <Text>{component.name}</Text>;
  }
}
