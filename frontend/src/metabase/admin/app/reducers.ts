import { createReducer } from "@reduxjs/toolkit";
import { t } from "ttag";

import { currentUserApi } from "metabase/current-user";
import { PLUGIN_ADMIN_ALLOWED_PATH_GETTERS } from "metabase/plugins";
import { combineReducers } from "metabase/redux";
import type { AdminPath, AdminPathKey } from "metabase/redux/store";
import { isNotNull } from "metabase/utils/types";

export const getAdminPaths: () => AdminPath[] = () => {
  const items: AdminPath[] = [
    {
      getName: () => t`Settings`,
      path: "/admin/settings",
      key: "settings",
    },
    {
      getName: () => t`Databases`,
      path: "/admin/databases",
      key: "databases",
    },
    {
      getName: () => t`AI`,
      path: "/admin/metabot",
      key: "metabot",
    },
    {
      getName: () => t`Table Metadata`,
      path: "/admin/datamodel",
      key: "data-model",
    },
    {
      getName: () => t`People`,
      path: "/admin/people",
      key: "people",
    },
    {
      getName: () => t`Permissions`,
      path: "/admin/permissions",
      key: "permissions",
    },
    {
      getName: () => t`Performance`,
      path: "/admin/performance",
      key: "performance",
    },
    {
      getName: () => t`Help`,
      path: "/admin/help",
      key: "help",
    },
  ];

  return items;
};

const paths = createReducer(
  () => getAdminPaths(),
  (builder) => {
    builder.addMatcher(
      currentUserApi.endpoints.getCurrentUser.matchFulfilled,
      (state, { payload: user }) => {
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
      },
    );
  },
);

export const appReducer = combineReducers({
  paths,
});
