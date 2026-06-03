import { memo } from "react";

import {
  Markdown,
  type MarkdownProps,
} from "metabase/common/components/Markdown";

import { rehypeAnimate } from "./rehypeAnimate";

const ANIMATE_PLUGINS = [rehypeAnimate];

type MarkdownBlockProps = {
  content: string;
  animate: boolean;
  components: Record<string, any>;
  markdownRest: Omit<MarkdownProps, "children" | "components" | "className">;
};

// One top-level markdown block. Rendered without a className so react-markdown
// emits a fragment (no wrapper element) — the blocks therefore sit flat inside
// AIMarkdown's single styling wrapper, matching the pre-streaming DOM shape.
//
// Memoized on its own content: as the streaming reply grows only the final
// (changing) block re-renders; earlier blocks stay frozen, so their already-shown
// words keep their DOM nodes and never re-animate.
const MarkdownBlockInner = ({
  content,
  animate,
  components,
  markdownRest,
}: MarkdownBlockProps) => (
  <Markdown
    components={components}
    rehypePlugins={animate ? ANIMATE_PLUGINS : undefined}
    {...markdownRest}
  >
    {content}
  </Markdown>
);

export const MarkdownBlock = memo(
  MarkdownBlockInner,
  (prev, next) =>
    prev.content === next.content &&
    prev.animate === next.animate &&
    prev.components === next.components &&
    prev.markdownRest === next.markdownRest,
);

MarkdownBlock.displayName = "MarkdownBlock";
