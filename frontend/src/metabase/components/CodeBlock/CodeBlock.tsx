import { CodeEditor } from "../CodeEditor";

import type { CodeLanguage } from "./types";

export type CodeBlockProps = {
  className?: string;
  code: string;
  highlightRanges?: { start: number; end: number }[];
  language: CodeLanguage;
  lineNumbers?: boolean;
};

export function CodeBlock({
  className,
  code,
  highlightRanges,
  language,
  lineNumbers,
}: CodeBlockProps) {
  return (
    <CodeEditor
      className={className}
      highlightRanges={highlightRanges}
      language={language}
      lineNumbers={lineNumbers}
      readOnly
      value={code}
    />
  );
}
