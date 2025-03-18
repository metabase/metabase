import { match } from "ts-pattern";
import { t } from "ttag";

export const getDisabledFeatureMessage = (options: {
  hasActionsEnabled: boolean;
  isPersisted: boolean;
  isUploadDb: boolean;
}) => {
  return match(options)
    .with(
      { hasActionsEnabled: true, isPersisted: true },
      () =>
        t`Database routing can't be enabled if model actions and persistence are enabled.`,
    )
    .with(
      { hasActionsEnabled: true },
      () => t`Database routing can't be enabled if model actions are enabled.`,
    )
    .with(
      { isPersisted: true },
      () =>
        t`Database routing can't be enabled if model persistence is enabled.`,
    )
    .with(
      { isUploadDb: true },
      () =>
        t`Database routing can't be enabled if uploads are enabled for this database.`,
    )
    .otherwise(() => undefined);
};
