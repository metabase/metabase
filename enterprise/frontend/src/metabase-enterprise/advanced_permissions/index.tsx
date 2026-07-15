import { t } from "ttag";

import { modalRoute } from "metabase/common/components/ModalRoute";
import {
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS,
  PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS,
  PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS,
  PLUGIN_ADVANCED_PERMISSIONS,
  PLUGIN_DATA_PERMISSIONS,
  PLUGIN_REDUCERS,
  type PermissionOption,
} from "metabase/plugins";
import { push } from "metabase/router";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import { DataPermissionValue } from "metabase-types/api";

import { ImpersonationModal } from "./components/ImpersonationModal";
import {
  shouldRestrictNativeQueryPermissions,
  upgradeViewPermissionsIfNeeded,
} from "./graph";
import { advancedPermissionsSlice, getImpersonatedPostAction } from "./reducer";
import { getImpersonations } from "./selectors";
import { getEditImpersonationUrl } from "./utils";

const IMPERSONATED_PERMISSION_OPTION = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  label: t`Impersonated`,
  value: DataPermissionValue.IMPERSONATED,
  icon: "database",
  iconColor: "warning",
} satisfies PermissionOption;

const BLOCK_PERMISSION_OPTION = {
  // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
  label: t`Blocked`,
  value: DataPermissionValue.BLOCKED,
  icon: "close",
  iconColor: "danger",
} satisfies PermissionOption;

/**
 * Initialize advanced permissions plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    const addSelectedAdvancedPermission = (
      options: PermissionOption[],
      value: string,
    ) => {
      if (value === IMPERSONATED_PERMISSION_OPTION.value) {
        return [...options, IMPERSONATED_PERMISSION_OPTION];
      }

      return options;
    };

    PLUGIN_ADMIN_PERMISSIONS_TABLE_OPTIONS.push(BLOCK_PERMISSION_OPTION);
    PLUGIN_ADMIN_PERMISSIONS_TABLE_FIELDS_OPTIONS.push(BLOCK_PERMISSION_OPTION);

    PLUGIN_ADVANCED_PERMISSIONS.addTablePermissionOptions =
      addSelectedAdvancedPermission;
    PLUGIN_ADVANCED_PERMISSIONS.addSchemaPermissionOptions =
      addSelectedAdvancedPermission;
    PLUGIN_ADVANCED_PERMISSIONS.addDatabasePermissionOptions = (
      options,
      database,
    ) => [
      ...options,
      ...(database.hasFeature("connection-impersonation")
        ? [IMPERSONATED_PERMISSION_OPTION]
        : []),
      BLOCK_PERMISSION_OPTION,
    ];

    PLUGIN_ADMIN_PERMISSIONS_DATABASE_ROUTES.push(
      modalRoute("impersonated/group/:groupId", ImpersonationModal),
    );

    PLUGIN_ADMIN_PERMISSIONS_DATABASE_GROUP_ROUTES.push(
      modalRoute(
        "impersonated/database/:impersonatedDatabaseId",
        ImpersonationModal,
      ),
    );

    PLUGIN_ADVANCED_PERMISSIONS.getDatabaseLimitedAccessPermission = (
      value,
    ) => {
      if (value === IMPERSONATED_PERMISSION_OPTION.value) {
        return DataPermissionValue.UNRESTRICTED;
      }
      return null;
    };

    PLUGIN_ADVANCED_PERMISSIONS.isAccessPermissionDisabled = (
      value,
      subject,
    ) => {
      if (subject === "tables" || subject === "fields") {
        return value === DataPermissionValue.IMPERSONATED;
      } else {
        return false;
      }
    };

    PLUGIN_ADVANCED_PERMISSIONS.isRestrictivePermission = (value) => {
      return value === DataPermissionValue.BLOCKED;
    };

    PLUGIN_ADVANCED_PERMISSIONS.shouldShowViewDataColumn = true;
    PLUGIN_ADVANCED_PERMISSIONS.defaultViewDataPermission =
      DataPermissionValue.BLOCKED;

    PLUGIN_ADMIN_PERMISSIONS_DATABASE_POST_ACTIONS[
      DataPermissionValue.IMPERSONATED
    ] = getImpersonatedPostAction;

    PLUGIN_REDUCERS.advancedPermissionsPlugin =
      advancedPermissionsSlice.reducer;

    PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors.push((state) => {
      const impersonations = getImpersonations(state);
      const impersonationGroupIds = impersonations.map((i) => `${i.group_id}`);
      return [{ impersonations }, impersonationGroupIds];
    });

    PLUGIN_DATA_PERMISSIONS.hasChanges.push(
      (state) => getImpersonations(state).length > 0,
    );

    PLUGIN_ADMIN_PERMISSIONS_DATABASE_ACTIONS[
      DataPermissionValue.IMPERSONATED
    ].push({
      label: t`Edit Impersonated`,
      iconColor: "warning",
      icon: "database",
      actionCreator: (entityId, groupId, view) => {
        if (entityId == null) {
          throw new Error("Impersonation can only be configured for databases");
        }

        return push(getEditImpersonationUrl(entityId, groupId, view));
      },
    });

    PLUGIN_DATA_PERMISSIONS.upgradeViewPermissionsIfNeeded =
      upgradeViewPermissionsIfNeeded;
    PLUGIN_DATA_PERMISSIONS.shouldRestrictNativeQueryPermissions =
      shouldRestrictNativeQueryPermissions;
  }
}
