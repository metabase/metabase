import cx from "classnames";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { Card } from "metabase/ui";

import S from "./PythonEditor.module.css";
import { completion } from "./utils";

export function PythonEditor({
  value,
  proposedValue,
  onChange,
  withPandasCompletions,
  className,
  readOnly,
  ...rest
}: {
  value: string;
  proposedValue?: string;

  onChange?: (value: string) => void;
  withPandasCompletions?: boolean;
  className?: string;
  readOnly?: boolean;
}) {
  return (
    <Card withBorder p={0}>
      <CodeEditor
        className={cx(S.editor, className)}
        value={value}
        proposedValue={proposedValue}
        onChange={onChange}
        language="python"
        extensions={withPandasCompletions ? completion : undefined}
        readOnly={readOnly}
        {...rest}
      />
    </Card>
  );
}
