import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

import {
  getNodeViewStage,
  getPillToken,
  hasErrorDecoration,
} from "../../editor";
import { useFilterBarContext } from "../FilterBar/FilterBarContext";
import { FilterPill } from "../FilterPill/FilterPill";

export const PillNodeView = (props: NodeViewProps) => {
  const { node, selected, decorations, deleteNode } = props;
  const { formatValues } = useFilterBarContext();
  const token = getPillToken(node);

  if (!token) {
    return null;
  }

  const stage = getNodeViewStage(props);

  return (
    <NodeViewWrapper as="span">
      <FilterPill
        content={token.content}
        formatValues={(parts) => formatValues(stage, parts)}
        isSelected={selected}
        hasError={hasErrorDecoration(decorations)}
        onRemove={deleteNode}
      />
    </NodeViewWrapper>
  );
};
