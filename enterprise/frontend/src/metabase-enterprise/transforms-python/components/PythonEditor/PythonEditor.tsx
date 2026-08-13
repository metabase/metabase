import type { Extension } from "@uiw/react-codemirror";
import cx from "classnames";
import _ from "underscore";

import { CodeEditor } from "metabase/common/components/CodeEditor";

import S from "./PythonEditor.module.css";
import { completion } from "./utils";

export type PythonEditorProps = {
  value: string;
  proposedValue?: string;

  onChange?: (value: string) => void;
  withPandasCompletions?: boolean;
  className?: string;
  readOnly?: boolean;
  extensions?: Extension[];
};

export function PythonEditor({
  value,
  proposedValue,
  onChange,
  withPandasCompletions,
  className,
  readOnly,
  extensions: externalExtensions,
  ...rest
}: PythonEditorProps) {
  const extensions = _.compact([
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
