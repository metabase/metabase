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

const TAB_LABELS = [
  "Get started",
  "Security",
  "Authentication",
  "Permissions",
  "Tenancy",
  "Appearance",
  "Localization",
];

type SetupOptions = {
  initialRoute?: string;
  hasSimpleEmbedding?: boolean;
};

function setup({
  initialRoute = "/embedding",
  hasSimpleEmbedding = true,
}: SetupOptions = {}) {
  const tokenFeatures = createMockTokenFeatures({
    embedding_simple: hasSimpleEmbedding,
  });

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
      <Route path="security" element={<div>{"Security body"}</div>} />
      <Route path="appearance" element={<div>{"Appearance body"}</div>} />
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
    expect(within(nav).getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/embedding/security",
    );
    expect(
      within(nav).getByRole("link", { name: "Localization" }),
    ).toHaveAttribute("href", "/embedding/localization");
  });

  it("marks only the Get started tab as current on the index route", async () => {
    setup({ initialRoute: "/embedding" });

    const nav = await findNav();

    expect(
      await within(nav).findByRole("link", { name: "Get started" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Security" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("marks the matching tab as current on a child route", async () => {
    setup({ initialRoute: "/embedding/security" });

    const nav = await findNav();

    expect(
      await within(nav).findByRole("link", { name: "Security" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(nav).getByRole("link", { name: "Get started" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("keeps Get started current on the setup wizard sub-pages", async () => {
    setup({ initialRoute: "/embedding/permissions-setup" });

    const nav = await findNav();

    // The wizard belongs to Get started, so the nav must not go blank there.
    expect(
      await within(nav).findByRole("link", { name: "Get started" }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("does not light up Permissions on the permissions-setup wizard", async () => {
    setup({ initialRoute: "/embedding/permissions-setup" });

    const nav = await findNav();

    // A prefix match would claim this path for the Permissions tab.
    expect(
      await within(nav).findByRole("link", { name: "Permissions" }),
    ).not.toHaveAttribute("aria-current");
  });

  it("renders the routed body", async () => {
    setup({ initialRoute: "/embedding/security" });

    expect(await screen.findByText("Security body")).toBeInTheDocument();
  });

  it("gates the Appearance tab without the embedding_simple feature", async () => {
    setup({ hasSimpleEmbedding: false });

    const appearanceTab = within(await findNav()).getByRole("link", {
      name: "Appearance",
    });

    expect(within(appearanceTab).getByTestId("upsell-gem")).toBeInTheDocument();
  });

  it("does not gate the Appearance tab with the embedding_simple feature", async () => {
    setup({ hasSimpleEmbedding: true });

    const appearanceTab = within(await findNav()).getByRole("link", {
      name: "Appearance",
    });

    expect(
      within(appearanceTab).queryByTestId("upsell-gem"),
    ).not.toBeInTheDocument();
  });
});
