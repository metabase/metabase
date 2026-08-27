import type { ReactNode } from "react";
import { t } from "ttag";

import type { RemoteSyncConflictVariant } from "metabase-types/api";

export type OptionValue =
  | "push"
  | "force-push"
  | "new-branch"
  | "merge"
  | "discard";

export const getContinueButtonText = (optionValue?: OptionValue) => {
  switch (optionValue) {
    case "push":
    case "force-push":
    case "new-branch":
      return t`Push changes`;
    case "merge":
      return t`Merge changes`;
    case "discard":
      return t`Delete unsynced changes`;
    default:
      return t`Continue`;
  }
};

export const getModalTitle = (
  variant: RemoteSyncConflictVariant,
  canMerge?: boolean,
): ReactNode => {
  switch (variant) {
    case "push":
      // The push variant is shown when the remote branch has advanced. When the changes can be merged
      // cleanly we frame it as new remote changes; otherwise we call out the conflict.
      return canMerge ? (
        <>
          {t`The remote branch has new changes.`} {t`What do you want to do?`}
        </>
      ) : (
        <>
          {t`Some of your changes conflict with the remote branch.`}{" "}
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
