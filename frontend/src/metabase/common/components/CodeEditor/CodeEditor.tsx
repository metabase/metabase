import type { Extension } from "@uiw/react-codemirror";

import { CodeMirror } from "metabase/common/components/CodeMirror";

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
  extensions?: Extension[];
  "data-testid"?: string;
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
  extensions: externalExtensions,
  ...rest
}: Props) {
  const extensions = useExtensions({
    language,
    extensions: externalExtensions,
  });

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
      {...rest}
    />
  );
}
