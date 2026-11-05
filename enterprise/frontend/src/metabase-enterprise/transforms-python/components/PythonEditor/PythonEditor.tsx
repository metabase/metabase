import type { Extension } from "@uiw/react-codemirror";
import cx from "classnames";
import { compact } from "es-toolkit";

import { CodeEditor } from "metabase/common/components/CodeEditor";

import S from "./PythonEditor.module.css";
import { completion } from "./utils";

export function PythonEditor({
  value,
  proposedValue,
  onChange,
  withPandasCompletions,
  className,
  readOnly,
  extensions: externalExtensions,
  ...rest
}: {
  value: string;
  proposedValue?: string;

  onChange?: (value: string) => void;
  withPandasCompletions?: boolean;
  className?: string;
  readOnly?: boolean;
  extensions?: Extension[];
}) {
  const extensions = compact([
    ...(externalExtensions ?? []),
    withPandasCompletions ? completion : undefined,
  ]);

  return (
    <CodeEditor
      className={cx(S.editor, className)}
      value={value}
      proposedValue={proposedValue}
      onChange={onChange}
      language="python"
      extensions={extensions}
      readOnly={readOnly}
      {...rest}
    />
  );
}
