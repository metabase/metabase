import type { ReactNode } from "react";
import { t } from "ttag";

import {
  type ExpressionError,
  type ExpressionErrorKind,
  isExpressionError,
} from "metabase/querying/expressions";

import S from "./Errors.module.css";

/**
 * The error of the code, in a bar below it: one line of plain text, its kind
 * and its message.
 */
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
    return (
      <div className={S.errors} role="alert">
        {content}
      </div>
    );
  }
  const title = getTitle(isExpressionError(error) ? error.kind : "syntax");
  return (
    <div className={S.errors} role="alert">
      {t`${title}.`} <ErrorText text={error.message} />
    </div>
  );
}

/** Text with the parts in backticks shown as code, like `[Total]`. */
export function ErrorText({ text }: { text: string }) {
  return (
    <>
      {text.split("`").map((part, index) =>
        index % 2 === 1 ? (
          <code key={index} className={S.code}>
            {part}
          </code>
        ) : (
          part
        ),
      )}
    </>
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
