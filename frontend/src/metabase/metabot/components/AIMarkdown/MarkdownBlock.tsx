import { memo } from "react";

import {
  Markdown,
  type MarkdownProps,
} from "metabase/common/components/Markdown";

// SEC-505: block all images; to support them we'll need detection for valid/allowed image sources
const DISALLOWED_ELEMENTS = ["img"];

type MarkdownBlockProps = {
  source: string;
  className?: string;
  components: Record<string, any>;
  rehypePlugins?: MarkdownProps["rehypePlugins"];
};

export const MarkdownBlock = memo(function MarkdownBlock({
  source,
  className,
  components,
  rehypePlugins,
}: MarkdownBlockProps) {
  return (
    <Markdown
      className={className}
      components={components}
      rehypePlugins={rehypePlugins}
      disallowedElements={DISALLOWED_ELEMENTS}
      unwrapDisallowed
    >
      {source}
    </Markdown>
  );
});
