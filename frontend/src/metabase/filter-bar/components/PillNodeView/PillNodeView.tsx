import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

import { getPillToken, getStage, hasErrorDecoration } from "../../editor";
import type { FilterBarAdapter } from "../../types";
import { FilterPill } from "../FilterPill/FilterPill";

type PillNodeViewProps<F> = NodeViewProps & {
  adapter: FilterBarAdapter<F>;
};

export const PillNodeView = <F,>({
  node,
  selected,
  decorations,
  deleteNode,
  adapter,
}: PillNodeViewProps<F>) => {
  const token = getPillToken<F>(node);
  const stageAdapter = adapter.stage(getStage(node));

  if (!token) {
    return null;
  }

  return (
    <NodeViewWrapper as="span">
      <FilterPill
        content={token.content}
        formatValues={stageAdapter.formatValues}
        isSelected={selected}
        hasError={hasErrorDecoration(decorations)}
        onRemove={deleteNode}
      />
    </NodeViewWrapper>
  );
};
