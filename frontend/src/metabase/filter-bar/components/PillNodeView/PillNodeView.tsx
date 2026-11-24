import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";

import { hasErrorDecoration } from "../../editor/error-highlight";
import { getPillId, getStage } from "../../editor/nodes";
import type { PillRegistry } from "../../editor/pill-registry";
import type { FilterBarAdapter } from "../../types";
import { FilterPill } from "../FilterPill/FilterPill";

type PillNodeViewProps<F> = NodeViewProps & {
  adapter: FilterBarAdapter<F>;
  registry: PillRegistry<F>;
};

export const PillNodeView = <F,>({
  node,
  selected,
  decorations,
  deleteNode,
  adapter,
  registry,
}: PillNodeViewProps<F>) => {
  const token = registry.get(getPillId(node));
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
