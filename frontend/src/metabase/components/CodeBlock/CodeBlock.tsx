import { syntaxHighlighting } from "@codemirror/language";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import cx from "classnames";
import { useMemo, useRef } from "react";

import { isNotNull } from "metabase/lib/types";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";

import S from "./CodeBlock.module.css";
import type { CodeLanguage } from "./types";
import { getLanguageExtension, highlightText, useHighlightText } from "./util";

export type CodeBlockProps = {
  code: string;
  language: CodeLanguage;
  className?: string;
  highlightRanges?: { start: number; end: number }[];
};

export function CodeBlock({
  code,
  language,
  className,
  highlightRanges,
}: CodeBlockProps) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () =>
      [
        syntaxHighlighting(metabaseSyntaxHighlighting),
        getLanguageExtension(language),
        highlightText(),
      ].filter(isNotNull),
    [language],
  );

  useHighlightText(ref, highlightRanges);

  return (
    <CodeMirror
      ref={ref}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
      }}
      value={code}
      extensions={extensions}
      readOnly
      className={cx(S.codeBlock, className, language)}
    />
  );
}
