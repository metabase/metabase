/* eslint-disable no-restricted-imports */
import {
  Group,
  type RenderTreeNodePayload,
  Text,
  Tree,
  type TreeNodeData,
  getTreeExpandedState,
  useTree,
} from "@mantine/core";
import { IconComponents } from "@tabler/icons-react";
import { useEffect, useMemo } from "react";

import { SYSTEM_COMPONENTS } from "../const/systemComponents";
import { TRAVERSE_STOP, traverseComponentTree } from "../helpers";
import { getComponentById } from "../hooks/use-apps";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import classes from "./SidebarTree.module.css";

type Props = {
  configuration: ComponentConfiguration;
  selectedComponent?: ComponentDefinition;
  onSelectComponent: (component: ComponentDefinition) => void;
};

export function SidebarTree({
  configuration,
  selectedComponent,
  onSelectComponent,
}: Props) {
  const data = useMemo(() => {
    return [componentToTreeItem(configuration.root)];
  }, [configuration]);

  const tree = useTree({
    multiple: false,
    initialSelectedState: selectedComponent
      ? [selectedComponent.id]
      : undefined,

    initialExpandedState: getTreeExpandedState(data, "*"),
  });

  useEffect(() => {
    tree.setSelectedState(selectedComponent ? [selectedComponent.id] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComponent]);

  useEffect(() => {
    const [id] = tree.selectedState;

    if (id !== selectedComponent?.id) {
      traverseComponentTree(configuration.root, (component) => {
        if (component.id === id) {
          onSelectComponent(component);
          return TRAVERSE_STOP;
        }
      });
    }
  }, [
    tree.selectedState,
    selectedComponent,
    configuration.root,
    onSelectComponent,
  ]);

  return (
    <Tree
      data={data}
      tree={tree}
      selectOnClick
      clearSelectionOnOutsideClick
      renderNode={renderNode}
      classNames={classes}
    />
  );
}

function componentToTreeItem(component: ComponentDefinition): TreeNodeData {
  return {
    value: component.id,
    label: component.componentId,
    children: component.children?.map(componentToTreeItem),
  };
}

function renderNode(payload: RenderTreeNodePayload) {
  const systemComponent = SYSTEM_COMPONENTS.find(
    (component) => component.id === payload.node.label,
  );

  const IconComponent = systemComponent?.icon ?? IconComponents;

  let customComponent = null;
  if (!systemComponent) {
    customComponent = getComponentById(payload.node.label as string);
  }

  return (
    <Group gap={5} {...payload.elementProps} bg="red">
      <IconComponent size={16} />
      <Text truncate="end" c={payload.selected ? "white" : undefined}>
        {systemComponent?.name ?? customComponent?.title ?? payload.node.label}
      </Text>
    </Group>
  );
}
