import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupAccessGrantsBackend,
  setupBugReportingDetailsEndpoint,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderRoutes } from "__support__/ui";
import { getRoutes } from "metabase/admin/routes";
import { UndoListing } from "metabase/common/components/UndoListing";
import { PLUGIN_IS_EE_BUILD } from "metabase/plugins";
import { Outlet, type RouteObject, toRouteObjects } from "metabase/router";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockTokenFeatures,
  createMockTokenStatus,
  createMockUser,
  createMockVersion,
} from "metabase-types/api/mocks";

export const VERSION_TAG = "v1.57.3";
export const HOSTING_ENV = "elastic-beanstalk";
export const CREATED_GRANT_ID = 7;

const ADMIN = createMockUser({
  id: 42,
  is_superuser: true,
  common_name: "Ada Admin",
  email: "ada@example.com",
});

export type SetupOpts = {
  isEnterprise?: boolean;
  isPaidPlan?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
};

const Guard = () => <Outlet />;

function findRoute(
  routes: RouteObject[],
  path: string,
): RouteObject | undefined {
  for (const route of routes) {
    if (route.path === path) {
      return route;
    }
    const found = findRoute(route.children ?? [], path);
    if (found) {
      return found;
    }
  }
  return undefined;
}

/**
 * Renders `/admin/help` from the real admin route table, so the help page and
 * the grant-access modal route are the ones the app declares.
 */
export function setup({
  isEnterprise = false,
  isPaidPlan = false,
  tokenFeatures = {},
}: SetupOpts = {}) {
  setupBugReportingDetailsEndpoint({ "hosting-env": HOSTING_ENV });
  setupAccessGrantsBackend({
    createdGrantId: CREATED_GRANT_ID,
    creator: {
      user_id: ADMIN.id,
      user_name: ADMIN.common_name,
      user_email: ADMIN.email,
    },
  });

  const state = createMockState({
    currentUser: ADMIN,
    settings: mockSettings({
      version: createMockVersion({ tag: VERSION_TAG }),
      "token-features": createMockTokenFeatures(tokenFeatures),
      "token-status": isPaidPlan
        ? createMockTokenStatus({ valid: true })
        : null,
    }),
  });

  if (isEnterprise) {
    setupTokenStatusEndpoint({ valid: isPaidPlan });
    // `metabase-enterprise/plugins` sets this once, when it is first imported,
    // and `reinitialize()` between tests resets it.
    PLUGIN_IS_EE_BUILD.isEEBuild = () => true;
    setupEnterprisePlugins();
  }

  return renderRoutes(
    (store) => {
      const adminRoutes = toRouteObjects(getRoutes(store, Guard, Guard));
      const helpRoute = findRoute(adminRoutes, "help");
      if (!helpRoute) {
        throw new Error("The admin route table has no help route");
      }
      return [
        {
          path: "/",
          element: (
            <>
              <Outlet />
              <UndoListing />
            </>
          ),
          children: [{ path: "admin", children: [helpRoute] }],
        },
      ];
    },
    { storeInitialState: state, initialRoute: "/admin/help" },
  );
}
