import { renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import { createMockUser } from "metabase-types/api/mocks";

import { getEmbeddingHubRoutes } from "./routes";

/**
 * This spec asserts route-tree structure, not access policy, so the guard is
 * stubbed to allow by default. Setting `mockGuardDenies` makes it deny instead.
 */
let mockGuardDenies = false;

jest.mock("./route-guards", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    CanAccessEmbeddingHub: () =>
      mockGuardDenies ? (
        <div data-testid="unauthorized-marker">{"Unauthorized"}</div>
      ) : (
        <Outlet />
      ),
  };
});

jest.mock("./components/EmbeddingHubLayout", () => {
  const { Outlet } = jest.requireActual("metabase/router");
  return {
    EmbeddingHubLayout: () => (
      <div data-testid="embedding-hub-layout">
        <Outlet />
      </div>
    ),
  };
});

jest.mock("metabase/admin/embedding/embedding-hub", () => ({
  EmbeddingHubAdminSettingsPage: () => (
    <div data-testid="get-started-page">{"Get started"}</div>
  ),
}));

jest.mock("metabase/admin/settings/components/EmbeddingSettings", () => ({
  EmbeddingSecurityWidgets: () => (
    <div data-testid="security-widgets">{"Security widgets"}</div>
  ),
  SharedCombinedEmbeddingSettings: () => (
    <div data-testid="guest-embeds-block">{"Guest embeds"}</div>
  ),
}));

jest.mock("metabase/admin/embedding/components/ThemeListing", () => ({
  EmbeddingThemeListingApp: ({ basePath }: { basePath?: string }) => (
    <div data-testid="theme-listing-page">{basePath}</div>
  ),
}));

jest.mock("metabase/admin/embedding/components/ThemeEditor", () => ({
  EmbeddingThemeEditorApp: ({ basePath }: { basePath?: string }) => (
    <div data-testid="theme-editor-page">{basePath}</div>
  ),
}));

function setup(initialRoute: string) {
  return renderWithProviders(
    <Route path="/">{getEmbeddingHubRoutes()}</Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
      }),
    },
  );
}

describe("embedding hub routes", () => {
  afterEach(() => {
    mockGuardDenies = false;
  });

  it.each([
    ["/embedding-hub", "get-started-page"],
    ["/embedding-hub/authentication", "Authentication"],
    ["/embedding-hub/permissions", "Permissions"],
    ["/embedding-hub/tenancy", "Tenancy"],
    ["/embedding-hub/localization", "Localization"],
  ])("renders the body for %s", async (route, marker) => {
    setup(route);

    const body = marker.endsWith("-page")
      ? await screen.findByTestId(marker)
      : await screen.findByRole("heading", { name: marker });

    expect(body).toBeInTheDocument();
  });

  it("folds the guest embeds block into the Security tab", async () => {
    setup("/embedding-hub/security");

    expect(await screen.findByTestId("security-widgets")).toBeInTheDocument();
    expect(screen.getByTestId("guest-embeds-block")).toBeInTheDocument();
  });

  it("renders the theme listing on the appearance tab, scoped to the hub path", async () => {
    setup("/embedding-hub/appearance");

    expect(await screen.findByTestId("theme-listing-page")).toHaveTextContent(
      "/embedding-hub/appearance",
    );
  });

  it("renders the theme editor for a single theme, scoped to the hub path", async () => {
    setup("/embedding-hub/appearance/12");

    expect(await screen.findByTestId("theme-editor-page")).toHaveTextContent(
      "/embedding-hub/appearance",
    );
  });

  it("does not render anything when the guard denies access", async () => {
    mockGuardDenies = true;
    setup("/embedding-hub");

    expect(
      await screen.findByTestId("unauthorized-marker"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("get-started-page")).not.toBeInTheDocument();
  });
});
