import { syntaxHighlighting } from "@codemirror/language";
import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";

import type { CodeLanguage } from "./types";
import { getLanguageExtension } from "./util";

export type CodeBlockProps = {
  code: string;
  language: CodeLanguage;
  className?: string;
};

export function CodeBlock({ code, language, ...props }: CodeBlockProps) {
  const extensions = useMemo(() => {
    const lang = getLanguageExtension(language);
    return [syntaxHighlighting(metabaseSyntaxHighlighting), lang].filter(
      isNotNull,
    );
  }, [language]);

  return (
    <CodeMirror value={code} extensions={extensions} readOnly {...props} />
  );
}
