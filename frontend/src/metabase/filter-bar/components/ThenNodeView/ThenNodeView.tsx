import { NodeViewWrapper } from "@tiptap/react";

import { StageSeparator } from "../StageSeparator/StageSeparator";

export const ThenNodeView = () => (
  <NodeViewWrapper as="span">
    <StageSeparator />
  </NodeViewWrapper>
);
