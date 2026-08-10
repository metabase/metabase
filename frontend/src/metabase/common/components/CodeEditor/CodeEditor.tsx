import type { Extension } from "@uiw/react-codemirror";
import { type FocusEventHandler, useMemo } from "react";

import { CodeMirror } from "metabase/common/components/CodeMirror";

import type { CodeLanguage } from "./types";
import { useExtensions } from "./utils";

type Props = {
  className?: string;
  highlightRanges?: { start: number; end: number }[];
  id?: string;
  language?: CodeLanguage | Extension;
  lineNumbers?: boolean;
  placeholder?: string;
  readOnly?: boolean;
  value: string;
  proposedValue?: string;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  onChange?: (value: string) => void;
  extensions?: Extension[];
  "aria-label"?: string;
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
