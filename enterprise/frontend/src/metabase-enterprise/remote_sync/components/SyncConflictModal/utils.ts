import { t } from "ttag";

export type OptionValue = "push" | "new-branch" | "discard";
export type SyncConflictVariant = "push" | "pull" | "switch-branch";

export const getContinueButtonText = (optionValue?: OptionValue) => {
  switch (optionValue) {
    case "push":
    case "new-branch":
      return t`Push changes`;
    case "discard":
      return t`Delete unsynced changes`;
    default:
      return t`Continue`;
  }
};
