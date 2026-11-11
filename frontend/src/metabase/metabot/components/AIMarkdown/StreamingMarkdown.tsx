import { useMemo, useRef } from "react";
import remend from "remend";

import type { MarkdownProps } from "metabase/common/components/Markdown";
import { isReducedMotionPreferred } from "metabase/utils/dom";
import { useLazyModule } from "metabase/utils/lazy-module";

import { MarkdownBlock } from "./MarkdownBlock";
import { createRehypeStreamWords } from "./rehypeStreamWords";
import { markedModule, splitMarkdownBlocks } from "./splitMarkdownBlocks";
import { useCoalescedSource } from "./useCoalescedSource";

type StreamingMarkdownProps = {
  source: string;
  isStreaming: boolean;
  blockClassName: string;
  components: Record<string, any>;
};

const repair = (source: string) => {
  try {
    // remend appends an emphasis closer after a block's trailing newline
    // (`*a\n` → `*a\n*`), which won't parse; trim so it lands against the content.
    return remend(source.trimEnd(), { linkMode: "text-only" });
  } catch {
    return source;
  }
};

// Repairs a possibly incomplete markdown stream to valid markdown and animates its rendering
export const StreamingMarkdown = ({
  source,
  isStreaming,
  blockClassName,
  components,
}: StreamingMarkdownProps) => {
  const animate = isStreaming && !isReducedMotionPreferred();
  const coalesced = useCoalescedSource(source, animate);
  const marked = useLazyModule(markedModule);
  const blocks = useMemo(
    () => splitMarkdownBlocks(coalesced, marked?.Lexer),
    [coalesced, marked],
  );

  // reuse each block's plugin so its animation boundary stays consistent across renders
  const pluginsByBlock = useRef(
    new Map<number, MarkdownProps["rehypePlugins"]>(),
  );

  const getPlugins = (index: number, isLast: boolean) => {
    const cached = pluginsByBlock.current.get(index);
    if (cached) {
      return cached;
    }
    if (!animate || !isLast) {
      return undefined;
    }
    const created = [createRehypeStreamWords({ animateFromChar: null })];
    pluginsByBlock.current.set(index, created);
    return created;
  };

  return (
    <>
      {blocks.map((block, index) => {
        const isLast = index === blocks.length - 1;
        return (
          <MarkdownBlock
            key={index}
            className={blockClassName}
            components={components}
            rehypePlugins={getPlugins(index, isLast)}
            source={isStreaming && isLast ? repair(block) : block}
          />
        );
      })}
    </>
  );
};
