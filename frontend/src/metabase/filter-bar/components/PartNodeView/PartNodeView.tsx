import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import type { MouseEvent } from "react";

import {
  editClickedPart,
  getClickedField,
  getDraftPart,
  placeCaretInField,
} from "../../editor";
import { PartView } from "../PartView/PartView";

export const PartNodeView = ({ editor, node, getPos }: NodeViewProps) => {
  const part = getDraftPart(node);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const pos = getPos();
    const field = getClickedField(event.nativeEvent);
    const isEdited = pos !== undefined && editClickedPart(editor, node, pos);
    if (isEdited && field !== null) {
      placeCaretInField(editor, field);
    }
  };

  if (!part) {
    return null;
  }

  return (
    <NodeViewWrapper as="span" onClick={handleClick}>
      <PartView part={part} isEditing />
    </NodeViewWrapper>
  );
};
