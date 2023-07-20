import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

export default () => {
  return (
    <NodeViewWrapper className="section-component">
      <span className="label" contentEditable={false}>
        Section
      </span>

      <NodeViewContent className="content" />
    </NodeViewWrapper>
  );
};
