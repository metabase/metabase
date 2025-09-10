import { CodeMirror } from "metabase/common/components/CodeMirror";

import type { CodeLanguage } from "./types";
import { useExtensions } from "./utils";

type Props = {
  className?: string;
  highlightRanges?: { start: number; end: number }[];
  id?: string;
  language?: CodeLanguage;
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
      className={className}
      extensions={extensions}
      id={id}
      readOnly={readOnly}
      value={value}
      onChange={onChange}
      highlightRanges={highlightRanges}
    />
  );
}
