import { Link } from "react-router";
import { match } from "ts-pattern";
import { t } from "ttag";

import {
  hasActionsEnabled,
  hasFeature,
  hasWritableConnectionDetails,
} from "metabase/admin/databases/utils";
import { Text } from "metabase/ui";
import type { Database } from "metabase-types/api";

export const getDisabledFeatureMessage = (database: Database) => {
  return match({
    hasActionsEnabled: hasActionsEnabled(database),
    isPersisted: hasFeature(database, "persist-models-enabled"),
    isUploadDb: database.uploads_enabled,
    supportsRouting: !!database.features?.includes("database-routing"),
    hasWritableConnection: hasWritableConnectionDetails(database),
  })
    .with(
      { supportsRouting: false },
      () => t`Database routing is not supported for this database type.`,
    )
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
    .with(
      { hasWritableConnection: true },
      () =>
        t`Database routing can't be enabled when a Writable Connection is enabled.`,
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
}): React.ReactNode => {
  if (disabledFeatureMessage) {
    return disabledFeatureMessage;
  } else if (hasNoUserAttributeOptions) {
    return (
      <>
        {t`You must set user attributes on users for this feature to be available`}{" "}
        <Text span c="inherit" td="underline">
          <Link to="/admin/people">{t`Edit user settings`}</Link>
        </Text>
      </>
    );
  } else if (!userAttribute) {
    return t`You must choose a user attribute to enable DB routing.`;
  } else {
    return undefined;
  }
};
