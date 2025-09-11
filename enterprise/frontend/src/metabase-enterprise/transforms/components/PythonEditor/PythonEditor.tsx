import { CodeEditor } from "metabase/common/components/CodeEditor";

import S from "./PythonEditor.module.css";
import { completion } from "./utils";

export function PythonEditor({
  value,
  onChange,
  withPandasCompletions,
}: {
  value: string;
  onChange: (value: string) => void;
  withPandasCompletions?: boolean;
}) {
  return (
    <CodeEditor
      className={S.editor}
      value={value}
      onChange={onChange}
      language="python"
      extensions={withPandasCompletions ? completion : undefined}
    />
  );
}
