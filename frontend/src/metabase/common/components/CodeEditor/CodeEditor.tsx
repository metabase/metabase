import type { Extension } from "@uiw/react-codemirror";
import { useMemo } from "react";

import {
  CodeMirror,
  type CodeMirrorProps,
} from "metabase/common/components/CodeMirror";

import type { CodeLanguage } from "./types";
import { useExtensions } from "./utils";

type Props = Omit<CodeMirrorProps, "onChange"> & {
  language?: CodeLanguage | Extension;
  lineNumbers?: boolean;
  proposedValue?: string;
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
  proposedValue,
  onChange,
  extensions: externalExtensions,
  ...rest
}: Props) {
  const extensions = useExtensions({
    language,
    extensions: externalExtensions,
    originalValue: proposedValue ? value : undefined,
    proposedValue,
  });

  const basicSetup = useMemo(
    () => ({
      lineNumbers,
      foldGutter: false,
      highlightActiveLine: false,
      highlightActiveLineGutter: false,
    }),
    [lineNumbers],
  );

  return (
    <CodeMirror
      basicSetup={basicSetup}
      className={className}
      extensions={extensions}
      id={id}
      editable={!readOnly}
      readOnly={readOnly}
      value={proposedValue ?? value}
      onChange={onChange}
      highlightRanges={highlightRanges}
      {...rest}
    />
  );
}
