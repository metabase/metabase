import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
} from "@tiptap/react";

import { PillFrame } from "../PillFrame/PillFrame";

import S from "./DraftNodeView.module.css";

export const DraftNodeView = ({ deleteNode }: NodeViewProps) => (
  <NodeViewWrapper as="span">
    <PillFrame isEditing onRemove={deleteNode}>
      <NodeViewContent<"span"> as="span" className={S.parts} />
    </PillFrame>
  </NodeViewWrapper>
);
