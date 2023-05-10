import { t } from "ttag";
import { combineReducers, handleActions } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_ADMIN_NAV_ITEMS,
  PLUGIN_ADMIN_TOOLS,
} from "metabase/plugins";
import { REFRESH_CURRENT_USER } from "metabase/redux/user";
import { AdminPath, AdminPathKey } from "metabase-types/store";
import { isNotNull } from "metabase/core/utils/types";
import { DISABLE_ADMIN_PATH, DISABLE_NOTICE } from "./actions";

const getAdminPaths: () => AdminPath[] = () => {
  const items: AdminPath[] = [
    {
      name: t`Settings`,
      path: "/admin/settings",
      key: "settings",
    },
    {
      name: t`Databases`,
      path: "/admin/databases",
      key: "databases",
    },
    {
      name: t`Data Model`,
      path: "/admin/datamodel",
      key: "data-model",
    },
    {
      name: t`People`,
      path: "/admin/people",
      key: "people",
    },
    {
      name: t`Permissions`,
      path: "/admin/permissions",
      key: "permissions",
    },
  ];

  const isModelPersistenceEnabled = Settings.get("persisted-models-enabled");
  const hasLoadedSettings = typeof isModelPersistenceEnabled === "boolean";

  if (
    !hasLoadedSettings ||
    isModelPersistenceEnabled ||
    PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES.length > 0
  ) {
    items.push({
      name: t`Tools`,
      path: "/admin/tools",
      key: "tools",
    });
  }

  items.push(...PLUGIN_ADMIN_NAV_ITEMS, {
    name: t`Troubleshooting`,
    path: "/admin/troubleshooting",
    key: "troubleshooting",
  });

  return items;
};

const paths = handleActions(
  {
    [DISABLE_ADMIN_PATH]: {
      next: (state: AdminPath[], { payload: pathKey }: { payload: any }) => {
        return state.filter(path => path.key !== pathKey);
      },
    },
    [REFRESH_CURRENT_USER]: {
      next: (state: AdminPath[], { payload: user }: { payload: any }) => {
        if (user.is_superuser) {
          return state;
        }

        const allowedPaths = PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.map(getter => {
          return getter(user);
        })
          .flat()
          .reduce((acc, pathKey) => {
            acc.add(pathKey);
            return acc;
          }, new Set<AdminPathKey>());

        return state
          .filter(path => (allowedPaths.has(path.key) ? path : null))
          .filter(isNotNull);
      },
    },
  },
  getAdminPaths(),
);

const isNoticeEnabled = handleActions(
  {
    [DISABLE_NOTICE]: { next: () => false },
  },
  Settings.deprecationNoticeEnabled(),
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default combineReducers({
  isNoticeEnabled,
  paths,
} as any);
