import { syntaxHighlighting } from "@codemirror/language";
import CodeMirror from "@uiw/react-codemirror";
import cx from "classnames";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";

import S from "./CodeBlock.module.css";
import type { CodeLanguage } from "./types";
import { getLanguageExtension } from "./util";

export type CodeBlockProps = {
  code: string;
  language: CodeLanguage;
  className?: string;
};

export function CodeBlock({ code, language, className }: CodeBlockProps) {
  const extensions = useMemo(
    () =>
      [
        syntaxHighlighting(metabaseSyntaxHighlighting),
        getLanguageExtension(language),
      ].filter(isNotNull),
    [language],
  );

  return (
    <CodeMirror
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
