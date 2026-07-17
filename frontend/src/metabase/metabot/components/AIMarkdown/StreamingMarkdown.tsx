import { useMemo, useRef } from "react";
import remend from "remend";

import type { MarkdownProps } from "metabase/common/components/Markdown";

import { MarkdownBlock } from "./MarkdownBlock";
import { createRehypeStreamWords } from "./rehypeStreamWords";
import { splitMarkdownBlocks } from "./splitMarkdownBlocks";
import { useCoalescedSource } from "./useCoalescedSource";

type StreamingMarkdownProps = {
  source: string;
  isStreaming: boolean;
  blockClassName: string;
  components: Record<string, any>;
};

// 'protocol' mode would turn a half-streamed link into a clickable placeholder URL.
const REMEND_OPTIONS = { linkMode: "text-only" } as const;

const repair = (source: string) => {
  try {
    // remend appends an emphasis closer after a block's trailing newline
    // (`*a\n` → `*a\n*`), which won't parse; trim so it lands against the content.
    return remend(source.trimEnd(), REMEND_OPTIONS);
  } catch {
    return source;
  }
};

// Renders a message as memoized top-level blocks so completed blocks stay put;
// while streaming, only the trailing block re-renders, fades in words, and repairs.
export const StreamingMarkdown = ({
  source,
  isStreaming,
  blockClassName,
  components,
}: StreamingMarkdownProps) => {
  const coalesced = useCoalescedSource(source, isStreaming);
  const blocks = useMemo(() => splitMarkdownBlocks(coalesced), [coalesced]);

  // Reuse each block's plugin so its animation boundary stays frozen across renders.
  const pluginsByBlock = useRef(
    new Map<number, MarkdownProps["rehypePlugins"]>(),
  );

  const getPlugins = (index: number, isLast: boolean) => {
    const cached = pluginsByBlock.current.get(index);
    if (cached) {
      return cached;
    }
    if (!isStreaming || !isLast) {
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
