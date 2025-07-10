import cx from "classnames";

import { Box } from "metabase/ui";

import { ComponentTreeNode } from "../components/ComponentTreeNode";
import type { ComponentDefinition } from "../types";

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
  return (
    <Box
      onClick={() => onSelect(component)}
      className={cx(S.root, {
        [S.selected]: selectedComponent?.id === component.id,
      })}
    >
      <ComponentTreeNode component={component} />
    </Box>
  );
}
