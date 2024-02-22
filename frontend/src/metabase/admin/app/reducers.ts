import { createReducer } from "@reduxjs/toolkit";
import { t } from "ttag";

import { combineReducers } from "metabase/lib/redux";
import Settings from "metabase/lib/settings";
import { isNotNull } from "metabase/lib/types";
import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_ADMIN_NAV_ITEMS,
  PLUGIN_ADMIN_TOOLS,
} from "metabase/plugins";
import { refreshCurrentUser } from "metabase/redux/user";
import type { AdminPath, AdminPathKey } from "metabase-types/store";

import { disableNotice } from "./actions";

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
      name: t`Table Metadata`,
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
    {
      name: t`Caching`,
      path: "/admin/caching",
      key: "caching",
    },
  ];

  const isModelPersistenceEnabled = Settings.get("persisted-models-enabled");

  if (isModelPersistenceEnabled || PLUGIN_ADMIN_TOOLS.EXTRA_ROUTES.length > 0) {
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

const paths = createReducer(getAdminPaths(), builder => {
  builder.addCase(refreshCurrentUser.fulfilled, (state, { payload: user }) => {
    if (user?.is_superuser) {
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
  });
});

const isNoticeEnabled = createReducer(
  Settings.deprecationNoticeEnabled(),
  builder => {
    builder.addCase(disableNotice.fulfilled, () => false);
  },
);

export const appReducer = combineReducers({
  isNoticeEnabled,
  paths,
});
