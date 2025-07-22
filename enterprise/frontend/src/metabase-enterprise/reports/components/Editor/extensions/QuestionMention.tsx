import { ReactNodeViewRenderer } from "@tiptap/react";

import { QuestionEmbedComponent, QuestionEmbedNode } from "./QuestionEmbedNode";

export const QuestionEmbed = QuestionEmbedNode.extend({
  addNodeView() {
    return ReactNodeViewRenderer(QuestionEmbedComponent);
  },
});
