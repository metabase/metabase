import CodeMirror from "@uiw/react-codemirror";
import { useMemo } from "react";

import { isNotNull } from "metabase/lib/types";

import type { CodeLanguage } from "./types";
import { getLanguageExtension } from "./util";

export type CodeBlockProps = {
  code: string;
  language: CodeLanguage;
};

export function CodeBlock({ code, language }: CodeBlockProps) {
  const extensions = useMemo(() => {
    const lang = getLanguageExtension(language);
    return [lang].filter(isNotNull);
  }, [language]);

  return <CodeMirror value={code} extensions={extensions} readOnly />;
}
