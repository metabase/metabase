import { IconPlus } from "@tabler/icons-react";
import cx from "classnames";
import { useCallback } from "react";

import { Box } from "metabase/ui";

import { ComponentTreeNode } from "../components/ComponentTreeNode";
import { SystemComponentId } from "../const/systemComponents";
import { getComponentName } from "../helpers";
import type { ComponentContext } from "../hooks/use-component-context";
import type { ComponentConfiguration, ComponentDefinition } from "../types";

import { ComponentPickPlaceholder } from "./ComponentPickPlaceholder";
import S from "./EditableComponentTreeNode.module.css";

type Props = {
  configuration: ComponentConfiguration;
  componentContext: ComponentContext;
  parentComponent?: ComponentDefinition;
  component: ComponentDefinition;
  selectedComponent: ComponentDefinition | null;
  onSelect: (component: ComponentDefinition) => void;
  onAddComponent: (
    position: "top" | "bottom" | "left" | "right",
    component: ComponentDefinition,
    parentComponent?: ComponentDefinition,
  ) => void;
};

export function EditableComponentTreeNode({
  configuration,
  componentContext,
  parentComponent,
  component,
  selectedComponent,
  onSelect,
  onAddComponent,
}: Props) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      onSelect(component);
    },
    [component, onSelect],
  );

  if (component.componentId === SystemComponentId.Placeholder) {
    return (
      <Box
        onClick={handleClick}
        className={cx(S.root, {
          [S.selectedPlaceholder]: selectedComponent?.id === component.id,
        })}
      >
        <ComponentPickPlaceholder />
      </Box>
    );
  }

  const canAddHorizontal =
    !parentComponent ||
    parentComponent?.componentId !== SystemComponentId.Stack;

  const canAddVertical =
    !parentComponent ||
    parentComponent?.componentId !== SystemComponentId.Group;

  return (
    <Box
      onClick={handleClick}
      className={cx(S.root, {
        [S.selected]: selectedComponent?.id === component.id,
      })}
    >
      <div className={S.componentName}>{getComponentName(component)}</div>
      {canAddVertical && (
        <>
          <AddSection
            position="top"
            component={component}
            parentComponent={parentComponent}
            onAddComponent={onAddComponent}
          />
          <AddSection
            position="bottom"
            component={component}
            parentComponent={parentComponent}
            onAddComponent={onAddComponent}
          />
        </>
      )}
      {canAddHorizontal && (
        <>
          <AddSection
            position="left"
            component={component}
            parentComponent={parentComponent}
            onAddComponent={onAddComponent}
          />
          <AddSection
            position="right"
            component={component}
            parentComponent={parentComponent}
            onAddComponent={onAddComponent}
          />
        </>
      )}
      <ComponentTreeNode
        configuration={configuration}
        componentContext={componentContext}
        component={component}
        ChildComponent={EditableComponentTreeNode}
        childComponentProps={{
          selectedComponent,
          onSelect,
          onAddComponent,
        }}
      />
    </Box>
  );
}

function AddSection({
  position,
  component,
  parentComponent,
  onAddComponent,
}: {
  position: "top" | "bottom" | "left" | "right";
  component: ComponentDefinition;
  parentComponent?: ComponentDefinition;
  onAddComponent: (
    position: "top" | "bottom" | "left" | "right",
    component: ComponentDefinition,
    parentComponent?: ComponentDefinition,
  ) => void;
}) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.preventDefault();
      onAddComponent(position, component, parentComponent);
    },
    [component, parentComponent, onAddComponent, position],
  );

  return (
    <Box
      className={cx(S.addSection, S[`add-${position}`])}
      onClick={handleClick}
    >
      <IconPlus size={12} color="white" />
    </Box>
  );
}
