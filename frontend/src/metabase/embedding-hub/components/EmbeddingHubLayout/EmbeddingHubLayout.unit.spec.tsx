import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { Route } from "metabase/router";
import {
  createMockSettings,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { EmbeddingHubLayout } from "./EmbeddingHubLayout";

jest.mock("metabase/admin/embedding/hooks", () => ({
  useEnsureDefaultEmbeddingThemes: jest.fn(),
}));

jest.mock("metabase/nav/components/AppSwitcher", () => ({
  AppSwitcher: () => null,
}));

// One tab today; each later issue adds its own and extends this list.
const TAB_LABELS = ["Get started"];

type SetupOptions = {
  initialRoute?: string;
};

function setup({ initialRoute = "/embedding" }: SetupOptions = {}) {
  const tokenFeatures = createMockTokenFeatures();

  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(
    createMockSettings({ "token-features": tokenFeatures }),
  );
  setupUserKeyValueEndpoints({
    namespace: "embedding_hub",
    key: "isNavbarOpened",
    value: true,
  });

  return renderWithProviders(
    <Route path="/embedding" element={<EmbeddingHubLayout />}>
      <Route index element={<div>{"Get started body"}</div>} />
      <Route
        path="permissions-setup"
        element={<div>{"Permissions wizard body"}</div>}
      />
    </Route>,
    {
      withRouter: true,
      initialRoute,
      storeInitialState: createMockState({
        currentUser: createMockUser({ is_superuser: true }),
        settings: mockSettings({ "token-features": tokenFeatures }),
      }),
    },
  );
}

function findNav() {
  return screen.findByRole("navigation", { name: "Embedding hub" });
}

describe("EmbeddingHubLayout", () => {
  it("renders every tab, in design order", async () => {
    setup();

    const links = within(await findNav()).getAllByRole("link");

    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(
      TAB_LABELS,
    );
  });

  it("links each tab to its own path", async () => {
    setup();

    const nav = await findNav();

    expect(
      await within(nav).findByRole("link", { name: "Get started" }),
    ).toHaveAttribute("href", "/embedding");
  });

  it("marks the Get started tab as current on the index route", async () => {
    setup({ initialRoute: "/embedding" });

    const nav = await findNav();

    expect(
      await within(nav).findByRole("link", { name: "Get started" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("keeps Get started current on the setup wizard sub-pages", async () => {
    setup({ initialRoute: "/embedding/permissions-setup" });

    const nav = await findNav();

    // The wizard belongs to Get started, so the nav must not go blank there.
    expect(
      await within(nav).findByRole("link", { name: "Get started" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("keeps the width cap on the permissions-setup wizard", async () => {
    setup({ initialRoute: "/embedding/permissions-setup" });

    await screen.findByText("Permissions wizard body");

    // /embedding/permissions is a string prefix of this path. Treating it as
    // the Permissions editor would drop the page padding and width cap.
    expect(screen.getByTestId("embedding-hub-content-cap")).toBeInTheDocument();
  });

  it("renders the routed body", async () => {
    setup({ initialRoute: "/embedding" });

    expect(await screen.findByText("Get started body")).toBeInTheDocument();
  });
});
