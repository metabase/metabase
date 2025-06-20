import cx from "classnames";
import { useMemo, useRef } from "react";

import {
  CodeMirror,
  type CodeMirrorRef,
} from "metabase/common/components/CodeMirror";

import S from "./CodeEditor.module.css";
import type { CodeLanguage } from "./types";
import { getLanguageExtension, highlightText, useHighlightText } from "./utils";

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
  const ref = useRef<CodeMirrorRef>(null);
  const extensions = useMemo(
    () => [getLanguageExtension(language), highlightText(highlightRanges)],
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
