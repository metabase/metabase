import { t } from "ttag";

export type OptionValue = "push" | "new-branch" | "discard";
export type ModalVariant = "push" | "switch-branch";

export const getContinueButtonText = (optionValue?: OptionValue) => {
  switch (optionValue) {
    case "push":
    case "new-branch":
      return t`Push changes`;
    case "discard":
      return t`Discard changes`;
    default:
      return t`Continue`;
  }
};
