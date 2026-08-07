import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupGroupsEndpoint,
  setupPermissionsGraphEndpoints,
  setupTenantEntpoints,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen } from "__support__/ui";
import { getPermissionsBasePath } from "metabase/admin/permissions/utils/base-path";
import { getGroupFocusPermissionsUrl } from "metabase/admin/permissions/utils/urls";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockGroup,
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { getEmbeddingHubRoutes } from "./routes";

/**
 * Unlike `routes.unit.spec.tsx`, which stubs every tab to assert route wiring,
 * this renders the real thing. The claim under test is the doc's central one:
 * that a route fragment written for admin renders correctly a second time
 * under the hub, at a different path.
 */

jest.mock("./components/EmbeddingHubLayout", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    EmbeddingHubLayout: () => <Outlet />,
  };
});

function setup({
  initialRoute,
  tokenFeatures = {},
  isUsingTenants = false,
}: {
  initialRoute: string;
  tokenFeatures?: Partial<TokenFeatures>;
  isUsingTenants?: boolean;
}) {
  // Settings first: the EE plugins register conditionally on
  // `hasPremiumFeature`, which reads the mocked settings, so registering them
  // before the mock is in place leaves PLUGIN_TENANTS.tenantsRoutes null.
  const settings = mockSettings({
    "token-features": createMockTokenFeatures(tokenFeatures),
    "use-tenants": isUsingTenants,
  });

  setupEnterprisePlugins();

  return renderWithProviders(
    <Route path="/">{getEmbeddingHubRoutes()}</Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        settings,
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("embedding hub tabs", () => {
  describe("Tenancy", () => {
    it("renders the real tenant listing, linked into the hub not back into admin", async () => {
      setupTenantEntpoints([
        createMockTenant({ id: 7, name: "Acme", slug: "acme" }),
      ]);

      setup({
        initialRoute: "/embedding/tenancy",
        tokenFeatures: { tenants: true },
        isUsingTenants: true,
      });

      const tenantLink = await screen.findByRole("link", { name: /Acme/ });
      expect(tenantLink).toHaveAttribute("href", "/embedding/tenancy/7/edit");
    });

    it("upsells instead of ejecting to admin when tenants are not licensed", async () => {
      setup({ initialRoute: "/embedding/tenancy" });

      // createTenantsRouteGuard would redirect to /admin/people here; the tab
      // renders conditionally so an always-visible tab never ejects.
      expect(await screen.findByText(/tenants/i)).toBeInTheDocument();
    });
  });

  describe("Permissions", () => {
    const DATABASE = createSampleDatabase();
    const GROUPS = [
      createMockGroup({ id: 2, name: "Analysts" }),
      createMockGroup({
        id: 1,
        name: "All internal users",
        magic_group_type: "all-internal-users",
      }),
    ];

    function setupPermissionsMocks() {
      setupDatabasesEndpoints([DATABASE]);
      setupGroupsEndpoint(GROUPS);
      setupPermissionsGraphEndpoints(GROUPS, [DATABASE]);
      setupTokenStatusEndpoint({ valid: true });
      fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);

      // The editor fires one group-graph request with an undefined id before
      // the route params resolve. It does the same under /admin/permissions --
      // admin's own specs never reach this depth, so nothing mocked it before.
      // Mocked here so the test measures the hub, not that pre-existing quirk.
      fetchMock.get("path:/api/permissions/graph/group/undefined", 200);
    }

    it("renders the real editor and points its drill-down links at the hub", async () => {
      setupPermissionsMocks();

      setup({ initialRoute: "/embedding/permissions/data/group/2" });

      expect(await screen.findByText("Analysts")).toBeInTheDocument();

      // The URL builders are called from redux selectors, not components, so
      // this is what proves the module-level base path actually reached them.
      expect(getGroupFocusPermissionsUrl(2)).toBe(
        "/embedding/permissions/data/group/2",
      );
    });

    it("restores the admin base path when the tab unmounts", async () => {
      setupPermissionsMocks();

      const { unmount } = setup({
        initialRoute: "/embedding/permissions/data/group/2",
      });

      await screen.findByText("Analysts");
      expect(getPermissionsBasePath()).toBe("/embedding/permissions");

      unmount();

      // Otherwise Monitor's group link would keep pointing into the hub for
      // the rest of the session.
      expect(getPermissionsBasePath()).toBe("/admin/permissions");
    });
  });
});
