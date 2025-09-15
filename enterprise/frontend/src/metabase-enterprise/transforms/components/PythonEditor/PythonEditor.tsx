import cx from "classnames";

import { CodeEditor } from "metabase/common/components/CodeEditor";

import S from "./PythonEditor.module.css";
import { completion } from "./utils";

export function PythonEditor({
  value,
  onChange,
  withPandasCompletions,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  withPandasCompletions?: boolean;
  className?: string;
}) {
  return (
    <CodeEditor
      className={cx(S.editor, className)}
      value={value}
      onChange={onChange}
      language="python"
      extensions={withPandasCompletions ? completion : undefined}
    />
  );
}
