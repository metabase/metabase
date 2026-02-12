import type { ReactNode } from "react";
import { t } from "ttag";

import type { RemoteSyncConflictVariant } from "metabase-types/api";

export type OptionValue = "push" | "force-push" | "new-branch" | "discard";

export const getContinueButtonText = (optionValue?: OptionValue) => {
  switch (optionValue) {
    case "push":
    case "force-push":
    case "new-branch":
      return t`Push changes`;
    case "discard":
      return t`Delete unsynced changes`;
    default:
      return t`Continue`;
  }
};

export const getModalTitle = (
  variant: RemoteSyncConflictVariant,
): ReactNode => {
  switch (variant) {
    case "push":
      return (
        <>
          {t`Your branch is behind the remote branch.`}{" "}
          {t`What do you want to do?`}
        </>
      );
    case "setup":
      return (
        <>
          {t`Your local data will be overwritten by the remote branch.`}{" "}
          {t`What do you want to do?`}
        </>
      );
    default:
      return t`You have unsynced changes. What do you want to do?`;
  }
};
