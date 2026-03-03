import type { Extension } from "@uiw/react-codemirror";
import cx from "classnames";
import { useMemo } from "react";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import type { AdvancedTransformType } from "metabase-types/api";

import S from "./PythonEditor.module.css";
import { getCompletionExtensions } from "./utils";

export function PythonEditor({
  type,
  value,
  proposedValue,
  onChange,
  className,
  readOnly,
  extensions: externalExtensions,
  ...rest
}: {
  type: AdvancedTransformType;
  value: string;
  proposedValue?: string;

  onChange?: (value: string) => void;
  className?: string;
  readOnly?: boolean;
  extensions?: Extension[];
}) {
  const extensions = useMemo(
    () => [...(externalExtensions ?? []), ...getCompletionExtensions(type)],
    [externalExtensions, type],
  );

  return (
    <CodeEditor
      className={cx(S.editor, className)}
      value={value}
      proposedValue={proposedValue}
      onChange={onChange}
      language={type === "javascript" ? "typescript" : type}
      extensions={extensions}
      readOnly={readOnly}
      {...rest}
    />
  );
}
