// Block-level memoization: split markdown into top-level blocks so each can be
// rendered by its own React.memo'd component. As streaming text grows, only the
// last block changes, so earlier blocks skip re-parsing/re-rendering entirely —
// turning the per-token cost from O(n) (re-render the whole reply) into O(1), and
// stopping earlier paragraphs from flickering as the tail mutates.
//
// We split on top-level blank lines while keeping fenced code blocks intact,
// rather than running a full markdown parser, to avoid pulling the (ESM-only,
// not-hoisted) remark parser in as a direct dependency. join("") of the result
// is exactly the input, so no characters are gained or lost.

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/;

export const splitMarkdownBlocks = (markdown: string): string[] => {
  if (!markdown) {
    return [];
  }

  const lines = markdown.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let fenceChar: string | null = null;
  let fenceLen = 0;

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join("\n"));
      current = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(FENCE_RE);

    if (fence) {
      const marker = fence[1];
      if (fenceChar == null) {
        fenceChar = marker[0];
        fenceLen = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLen) {
        fenceChar = null;
        fenceLen = 0;
      }
      current.push(line);
      continue;
    }

    // A blank line outside a fence ends the current block. The blank line is
    // kept on the just-finished block so join("") reproduces the input.
    if (fenceChar == null && line.trim() === "") {
      current.push(line);
      flush();
      continue;
    }

    current.push(line);
  }

  flush();

  // Re-insert the "\n" that split() consumed between lines so the blocks
  // concatenate back to the original string.
  return blocks.map((block, index) =>
    index < blocks.length - 1 ? `${block}\n` : block,
  );
};
