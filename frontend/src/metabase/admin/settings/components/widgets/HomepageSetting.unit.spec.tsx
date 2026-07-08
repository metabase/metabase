import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupCurrentUserEndpoint,
  setupDashboardEndpoints,
  setupPropertiesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import { PLUGIN_HOMEPAGE_SETTING } from "metabase/plugins";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockRecentCollectionItem,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { HomepageSetting, getHomepageMode } from "./HomepageSetting";

function FakeUrlControl() {
  return <div data-testid="fake-url-control">URL CONTROL</div>;
}

type SetupProps = {
  "custom-homepage"?: boolean;
  "custom-homepage-dashboard"?: number | null;
  "landing-page"?: string;
  "dismissed-custom-dashboard-toast"?: boolean;
  withCustomUrlPlugin?: boolean;
};

const setup = ({
  withCustomUrlPlugin = false,
  ...settingsProps
}: SetupProps = {}) => {
  mockGetBoundingClientRect();
  const settings = createMockSettings({
    "custom-homepage": false,
    "custom-homepage-dashboard": null,
    "landing-page": "",
    "dismissed-custom-dashboard-toast": false,
    ...settingsProps,
  });

  const collection = createMockCollection({ id: 1, name: "Good Collection" });
  setupCollectionsEndpoints({ collections: [collection] });
  setupCollectionByIdEndpoint({ collections: [collection] });
  setupCollectionItemsEndpoint({
    collection: { id: "root" },
    collectionItems: [
      createMockCollectionItem({
        model: "dashboard",
        id: 4242,
        can_write: true,
        name: "My dashboard",
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: { id: 1 },
    collectionItems: [
      createMockCollectionItem({
        model: "dashboard",
        id: 4243,
        can_write: true,
        name: "My other dashboard",
      }),
    ],
  });
  setupRecentViewsAndSelectionsEndpoints([
    createMockRecentCollectionItem({
      model: "dashboard",
      id: 4242,
      can_write: true,
      name: "My dashboard",
    }),
  ]);
  setupDashboardEndpoints(
    createMockDashboard({ id: 4242, name: "My dashboard" }),
  );

  setupPropertiesEndpoints(settings);
  setupCurrentUserEndpoint(createMockUser({ id: 1, email: "dude@aol.com" }));
  setupUpdateSettingsEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({ key: "custom-homepage", value: false }),
    createMockSettingDefinition({
      key: "custom-homepage-dashboard",
      value: null,
    }),
    createMockSettingDefinition({ key: "landing-page", value: "" }),
    createMockSettingDefinition({
      key: "dismissed-custom-dashboard-toast",
      value: false,
    }),
  ]);

  PLUGIN_HOMEPAGE_SETTING.CustomUrlOption = withCustomUrlPlugin
    ? { label: "Custom URL", Control: FakeUrlControl }
    : null;

  return renderWithProviders(
    <div>
      <HomepageSetting />
      <UndoListing />
    </div>,
  );
};

const findBulkPutBody = async () => {
  const requests = await findRequests("PUT");
  const bulk = requests.find(({ url }) => url.endsWith("/api/setting"));
  return bulk?.body as Record<string, unknown> | undefined;
};

describe("getHomepageMode", () => {
  it("returns 'default' when nothing is set", () => {
    expect(getHomepageMode(null, null)).toBe("default");
    expect(getHomepageMode("", false)).toBe("default");
    expect(getHomepageMode(undefined, undefined)).toBe("default");
  });

  it("treats a bare '/' landing page as 'default'", () => {
    expect(getHomepageMode("/", false)).toBe("default");
    expect(getHomepageMode("/", true)).toBe("dashboard");
  });

  it("returns 'dashboard' when custom-homepage is on and landing-page is empty", () => {
    expect(getHomepageMode("", true)).toBe("dashboard");
    expect(getHomepageMode(null, true)).toBe("dashboard");
  });

  it("returns 'url' when landing-page is set, taking precedence over custom-homepage", () => {
    expect(getHomepageMode("/dashboard/7", false)).toBe("url");
    expect(getHomepageMode("/dashboard/7", true)).toBe("url");
  });
});

describe("HomepageSetting", () => {
  afterEach(() => {
    PLUGIN_HOMEPAGE_SETTING.CustomUrlOption = null;
  });

  it("renders the radio with default option selected when nothing is set", async () => {
    setup();
    expect(await screen.findByText("Homepage")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Default Metabase home" }),
    ).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dashboard" })).not.toBeChecked();
    expect(screen.queryByText("Pick a dashboard")).not.toBeInTheDocument();
  });

  it("hides Custom URL when the plugin is not registered", async () => {
    setup();
    await screen.findByText("Homepage");
    expect(
      screen.queryByRole("radio", { name: "Custom URL" }),
    ).not.toBeInTheDocument();
  });

  it("shows Custom URL when the plugin is registered", async () => {
    setup({ withCustomUrlPlugin: true });
    expect(
      await screen.findByRole("radio", { name: "Custom URL" }),
    ).toBeInTheDocument();
  });

  it("selects Dashboard mode when custom-homepage is on", async () => {
    setup({ "custom-homepage": true, "custom-homepage-dashboard": 4242 });
    expect(
      await screen.findByRole("radio", { name: "Dashboard" }),
    ).toBeChecked();
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
  });

  it("selects Custom URL mode when landing-page is set, taking precedence over custom-homepage", async () => {
    setup({
      withCustomUrlPlugin: true,
      "custom-homepage": true,
      "custom-homepage-dashboard": 4242,
      "landing-page": "/dashboard/7",
    });
    const urlRadio = await screen.findByRole("radio", { name: "Custom URL" });
    await waitFor(() => expect(urlRadio).toBeChecked());
    expect(screen.getByTestId("fake-url-control")).toBeInTheDocument();
  });

  it("treats a bare-slash landing page as Default", async () => {
    setup({ withCustomUrlPlugin: true, "landing-page": "/" });
    expect(
      await screen.findByRole("radio", { name: "Default Metabase home" }),
    ).toBeChecked();
  });

  it("clears landing-page and turns custom-homepage on when switching to Dashboard", async () => {
    setup({ withCustomUrlPlugin: true, "landing-page": "/some/url" });

    await userEvent.click(
      await screen.findByRole("radio", { name: "Dashboard" }),
    );

    await waitFor(async () => {
      const body = await findBulkPutBody();
      expect(body).toEqual({ "custom-homepage": true, "landing-page": "" });
    });
  });

  it("clears landing-page and turns custom-homepage off when switching to Default", async () => {
    setup({ withCustomUrlPlugin: true, "landing-page": "/some/url" });

    await userEvent.click(
      await screen.findByRole("radio", { name: "Default Metabase home" }),
    );

    await waitFor(async () => {
      const body = await findBulkPutBody();
      expect(body).toEqual({ "custom-homepage": false, "landing-page": "" });
    });
  });

  it("turns custom-homepage off when switching to Custom URL", async () => {
    setup({
      withCustomUrlPlugin: true,
      "custom-homepage": true,
      "custom-homepage-dashboard": 4242,
    });

    await userEvent.click(
      await screen.findByRole("radio", { name: "Custom URL" }),
    );

    await waitFor(async () => {
      const body = await findBulkPutBody();
      expect(body).toEqual({ "custom-homepage": false });
    });
  });

  it("hides the dashboard picker immediately on mode switch and restores it on switch back", async () => {
    // Optimistic UI: clicking another radio should flip the visible mode
    // without waiting for the bulk PUT round-trip.
    setup({ "custom-homepage": true, "custom-homepage-dashboard": 4242 });

    expect(await screen.findByText("My dashboard")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("radio", { name: "Default Metabase home" }),
    );
    expect(screen.queryByText("My dashboard")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("radio", { name: "Dashboard" }));
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
  });

  it("does not clear the dashboard id when leaving Dashboard mode", async () => {
    setup({ "custom-homepage": true, "custom-homepage-dashboard": 4242 });

    await screen.findByText("My dashboard");
    await userEvent.click(
      screen.getByRole("radio", { name: "Default Metabase home" }),
    );

    await waitFor(async () => {
      const body = await findBulkPutBody();
      expect(body).toBeDefined();
      expect(body).not.toHaveProperty("custom-homepage-dashboard");
    });
  });

  it("writes the dashboard id and dismisses the toast when picking a dashboard", async () => {
    setup({ "custom-homepage": true });
    const picker = await screen.findByText("Pick a dashboard");
    await userEvent.click(picker);

    await screen.findByText("Choose a dashboard");
    setupPropertiesEndpoints(
      createMockSettings({
        "custom-homepage": true,
        "custom-homepage-dashboard": 4242,
      }),
    );
    await userEvent.click(await screen.findByText(/My dashboard/));

    await waitFor(async () => {
      const body = await findBulkPutBody();
      expect(body).toEqual({
        "custom-homepage-dashboard": 4242,
        "dismissed-custom-dashboard-toast": true,
      });
    });
  });

  it("refreshes the current user after switching modes", async () => {
    setup();
    await userEvent.click(
      await screen.findByRole("radio", { name: "Dashboard" }),
    );

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls();
      expect(
        calls.find((call) => call.url?.includes("/api/user/current")),
      ).toBeDefined();
    });
  });
});
