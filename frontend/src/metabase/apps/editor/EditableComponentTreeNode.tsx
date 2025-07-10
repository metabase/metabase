import { IconPlus } from "@tabler/icons-react";
import cx from "classnames";
import { useCallback } from "react";

import { Box } from "metabase/ui";

import { ComponentTreeNode } from "../components/ComponentTreeNode";
import { SystemComponentId } from "../const/systemComponents";
import type { ComponentDefinition } from "../types";

import { ComponentPickPlaceholder } from "./ComponentPickPlaceholder";
import S from "./EditableComponentTreeNode.module.css";

type Props = {
  component: ComponentDefinition;
  selectedComponent: ComponentDefinition | null;
  onSelect: (component: ComponentDefinition) => void;
};

export function EditableComponentTreeNode({
  component,
  selectedComponent,
  onSelect,
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
    return <ComponentPickPlaceholder />;
  }

  return (
    <Box
      onClick={handleClick}
      className={cx(S.root, {
        [S.selected]: selectedComponent?.id === component.id,
      })}
    >
      <Box className={cx(S.addSection, S.addSectionTop)}>
        <IconPlus size={12} color="var(--mb-color-brand)" />
      </Box>
      <Box className={cx(S.addSection, S.addSectionBottom)}>
        <IconPlus size={12} color="var(--mb-color-brand)" />
      </Box>
      <Box className={cx(S.addSection, S.addSectionLeft)}>
        <IconPlus size={12} color="var(--mb-color-brand)" />
      </Box>
      <Box className={cx(S.addSection, S.addSectionRight)}>
        <IconPlus size={12} color="var(--mb-color-brand)" />
      </Box>
      <ComponentTreeNode
        component={component}
        ChildComponent={EditableComponentTreeNode}
        childComponentProps={{
          selectedComponent,
          onSelect,
        }}
      />
    </Box>
  );
}
