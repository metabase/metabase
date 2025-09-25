import type { Extension } from "@uiw/react-codemirror";
import cx from "classnames";

import { CodeMirror } from "metabase/common/components/CodeMirror";

import S from "./CodeEditor.module.css";
import type { CodeLanguage } from "./types";
import { useExtensions } from "./utils";

type Props = {
  className?: string;
  highlightRanges?: { start: number; end: number }[];
  id?: string;
  language?: CodeLanguage | Extension;
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
  const extensions = useExtensions({ language });

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
      value={value}
      onChange={onChange}
      highlightRanges={highlightRanges}
    />
  );
}
