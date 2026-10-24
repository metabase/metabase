import { match } from "ts-pattern";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import {
  hasActionsEnabled,
  hasTableEditingEnabled,
  hasWritableConnectionDetails,
} from "metabase/common/utils/database";
import { hasFeature } from "metabase/databases";
import { Text } from "metabase/ui";
import type { Database } from "metabase-types/api";

export const getDisabledFeatureMessage = (database: Database) => {
  return match({
    isPersisted: hasFeature(database, "persist-models-enabled"),
    supportsRouting: !!database.features?.includes("database-routing"),
  })
    .with(
      { supportsRouting: false },
      () => t`Database routing is not supported for this database type.`,
    )
    .with(
      { isPersisted: true },
      () =>
        t`Database routing can't be enabled if model persistence is enabled.`,
    )
    .otherwise(() => undefined);
};

export const getExternalModeDisabledMessage = (
  database: Database,
  { hasTransforms = false }: { hasTransforms?: boolean } = {},
) => {
  return match({
    hasActionsEnabled: hasActionsEnabled(database),
    hasTableEditingEnabled: hasTableEditingEnabled(database),
    isUploadDb: database.uploads_enabled,
    hasWritableConnection: hasWritableConnectionDetails(database),
    hasTransforms,
  })
    .with(
      { hasActionsEnabled: true },
      () =>
        t`Destination databases on different servers aren't supported when data actions are enabled.`,
    )
    .with(
      { isUploadDb: true },
      () =>
        t`Destination databases on different servers aren't supported when uploads are enabled for this database.`,
    )
    .with(
      { hasWritableConnection: true },
      () =>
        t`Destination databases on different servers aren't supported when a Writable Connection is enabled.`,
    )
    .with(
      { hasTableEditingEnabled: true },
      () =>
        t`Destination databases on different servers aren't supported when table editing is enabled.`,
    )
    .with(
      { hasTransforms: true },
      () =>
        t`Destination databases on different servers aren't supported when transforms exist.`,
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
