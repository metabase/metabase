import { syntaxHighlighting } from "@codemirror/language";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import cx from "classnames";
import { useMemo, useRef } from "react";

import { isNotNull } from "metabase/lib/types";
import { metabaseSyntaxHighlighting } from "metabase/ui/syntax";

import S from "./CodeEditor.module.css";
import type { CodeLanguage } from "./types";
import {
  getLanguageExtension,
  highlightText,
  nonce,
  useHighlightText,
} from "./utils";

type Props = {
  className?: string;
  highlightRanges?: { start: number; end: number }[];
  id?: string;
  language: CodeLanguage;
  lineNumbers?: boolean;
  readOnly?: boolean;
  value: string;
  onChange?: (value: string) => void;
};

export function CodeEditor({
  className,
  highlightRanges,
  id,
  language,
  lineNumbers = true,
  readOnly,
  value,
  onChange,
}: Props) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const extensions = useMemo(
    () =>
      [
        nonce(),
        syntaxHighlighting(metabaseSyntaxHighlighting),
        getLanguageExtension(language),
        highlightText(highlightRanges),
      ].filter(isNotNull),
    [language, highlightRanges],
  );

  useHighlightText(ref, highlightRanges);

  return (
    <CodeMirror
      basicSetup={{
        lineNumbers,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
      className={cx(S.codeEditor, className)}
      extensions={extensions}
      id={id}
      readOnly={readOnly}
      ref={ref}
      value={value}
      onChange={onChange}
    />
  );
}
