import { t } from "ttag";
import { combineReducers, handleActions } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { User } from "metabase-types/api";
import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_ADMIN_NAV_ITEMS,
} from "metabase/plugins";
import { REFRESH_CURRENT_USER } from "metabase/redux/user";
import { AdminPath, AdminPathKey } from "metabase-types/store";
import { DISABLE_ADMIN_PATH, DISABLE_NOTICE } from "./actions";

const getAdminPaths: () => AdminPath[] = () => [
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
  ...PLUGIN_ADMIN_NAV_ITEMS,
  {
    name: t`Troubleshooting`,
    path: "/admin/troubleshooting",
    key: "troubleshooting",
  },
];

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
          .filter(Boolean);
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

export default combineReducers({
  isNoticeEnabled,
  paths,
} as any);
