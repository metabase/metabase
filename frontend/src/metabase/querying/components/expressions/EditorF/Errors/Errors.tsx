import type { ReactNode } from "react";
import { t } from "ttag";

import {
  type ExpressionError,
  type ExpressionErrorKind,
  isExpressionError,
} from "metabase/querying/expressions";

import S from "./Errors.module.css";

/** The error of the code, in a bar below it: its kind and its message. */
export function Errors({
  error,
  content,
}: {
  error?: ExpressionError | Error | null;
  /** Shown instead of the error. */
  content?: ReactNode;
}) {
  if (!error) {
    return null;
  }
  if (content != null) {
    return <div className={S.errors}>{content}</div>;
  }
  return (
    <div className={S.errors} role="alert">
      <span className={S.title}>
        {getTitle(isExpressionError(error) ? error.kind : "syntax")}
      </span>
      <span className={S.message}>{error.message}</span>
    </div>
  );
}

function getTitle(kind: ExpressionErrorKind) {
  switch (kind) {
    case "syntax":
      return t`Syntax error`;
    case "type":
      return t`Type error`;
    case "column":
      return t`Unknown column`;
    case "function":
      return t`Unknown function`;
    case "unsupported":
      return t`Not supported`;
    case "arguments":
      return t`Wrong arguments`;
    case "reference":
      return t`Circular reference`;
  }
}
