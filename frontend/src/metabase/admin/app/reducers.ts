import { createReducer } from "@reduxjs/toolkit";
import { t } from "ttag";

import { combineReducers } from "metabase/lib/redux";
import { isNotNull } from "metabase/lib/types";
import { PLUGIN_ADMIN_ALLOWED_PATH_GETTERS } from "metabase/plugins";
import { refreshCurrentUser } from "metabase/redux/user";
import type { AdminPath, AdminPathKey } from "metabase-types/store";

export const getAdminPaths: () => AdminPath[] = () => {
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
      name: t`Embedding`,
      path: "/admin/embedding",
      key: "embedding",
    },
    {
      name: t`AI`,
      path: "/admin/metabot",
      key: "metabot",
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
      name: t`Performance`,
      path: "/admin/performance",
      key: "performance",
    },
    {
      name: t`Tools`,
      path: "/admin/tools",
      key: "tools",
    },
  ];

  return items;
};

const paths = createReducer(getAdminPaths(), (builder) => {
  builder.addCase(refreshCurrentUser.fulfilled, (state, { payload: user }) => {
    if (user?.is_superuser) {
      return state;
    }

    const allowedPaths = PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.map((getter) => {
      return getter(user);
    })
      .flat()
      .reduce((acc, pathKey) => {
        acc.add(pathKey);
        return acc;
      }, new Set<AdminPathKey>());

    return state
      .filter((path) => (allowedPaths.has(path.key) ? path : null))
      .filter(isNotNull);
  });
});

export const appReducer = combineReducers({
  paths,
});
