import cx from "classnames";
import { t } from "ttag";

import S from "./Editor.module.css";
import ErrorsS from "./Errors/Errors.module.css";
import LoadingDots from "./loading-dots.svg?component";

/** The row under the code that shows that the AI works, or why it failed. */
export function InlinePromptStatus({
  isLoading,
  error,
}: {
  isLoading: boolean;
  error?: string;
}) {
  if (isLoading) {
    return (
      <div className={cx(ErrorsS.errors, ErrorsS.inline, S.promptStatus)}>
        <LoadingDots className={S.loadingDots} aria-hidden />
        <span role="status">{t`Mulling...`}</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className={cx(ErrorsS.errors, ErrorsS.inline)} role="alert">
        <span className={ErrorsS.title}>{t`AI can't do this`}</span>
        <span className={ErrorsS.message}>{error}</span>
      </div>
    );
  }
  return null;
}
