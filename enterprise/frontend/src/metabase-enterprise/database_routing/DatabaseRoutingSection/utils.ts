import { match } from "ts-pattern";
import { t } from "ttag";

import type Database from "metabase-lib/v1/metadata/Database";

export const getDisabledFeatureMessage = (database: Database) => {
  return match({
    hasActionsEnabled: database.hasActionsEnabled(),
    isPersisted: database.isPersisted(),
    isUploadDb: database.uploads_enabled,
  })
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

export const getSelectErrorMessage = ({
  disabledFeatureMessage,
  userAttribute,
  hasNoUserAttributeOptions,
}: {
  disabledFeatureMessage: string | undefined;
  userAttribute: string | undefined;
  hasNoUserAttributeOptions: boolean;
}) => {
  if (disabledFeatureMessage) {
    return disabledFeatureMessage;
  } else if (hasNoUserAttributeOptions) {
    return t`You must set user attributes on users for this feature to be available`;
  } else if (!userAttribute) {
    return t`You must choose a user attribute to enable DB routing`;
  } else {
    return undefined;
  }
};
