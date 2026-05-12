import { diffLines } from "diff";
import { useMemo } from "react";

import { Box } from "metabase/ui";

import S from "./SqlDiff.module.css";

type Props = {
  /** SQL of the existing transform (current state). */
  before: string;
  /** SQL of the proposed transform (after applying the suggestion). */
  after: string;
};

type Segment = {
  kind: "context" | "added" | "removed";
  text: string;
};

/**
 * Unified line-by-line diff of two SQL bodies. We deliberately use
 * `diffLines` rather than word/char diff: SQL is line-oriented and
 * mixed-granularity diffs render as noise.
 */
export function SqlDiff({ before, after }: Props) {
  const segments = useMemo(() => buildSegments(before, after), [before, after]);

  return (
    <Box className={S.wrap} role="figure" aria-label="SQL diff">
      <pre className={S.pre}>
        {segments.map((seg, idx) => (
          <span key={idx} className={S[seg.kind]}>
            {prefixLines(seg.text, seg.kind)}
          </span>
        ))}
      </pre>
    </Box>
  );
}

function buildSegments(before: string, after: string): Segment[] {
  // Normalise trailing whitespace per line so cosmetic-only diffs don't render.
  const left = normalise(before);
  const right = normalise(after);
  return diffLines(left, right).map(
    (part): Segment => ({
      kind: part.added ? "added" : part.removed ? "removed" : "context",
      text: part.value,
    }),
  );
}

function normalise(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/u, ""))
    .join("\n");
}

function prefixLines(text: string, kind: Segment["kind"]): string {
  const marker = kind === "added" ? "+ " : kind === "removed" ? "- " : "  ";
  // Each chunk from diffLines ends in a newline; keep that newline and
  // prefix every line *inside* the chunk.
  const lines = text.split("\n");
  // The last element after split is "" when text ends with "\n"; preserve it.
  return lines
    .map((line, i) =>
      i === lines.length - 1 && line === "" ? "" : marker + line,
    )
    .join("\n");
}
