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
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
} from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockRecentCollectionItem,
  createMockSettingDefinition,
  createMockSettings,
  createMockUser,
} from "metabase-types/api/mocks";

import { CustomHomepageDashboardSetting } from "./CustomHomepageDashboardSetting";

const setup = (
  props: {
    "custom-homepage"?: boolean;
    "custom-homepage-dashboard"?: number | null;
    "dismissed-custom-dashboard-toast"?: boolean;
  } = {
    "custom-homepage": false,
    "custom-homepage-dashboard": null,
    "dismissed-custom-dashboard-toast": false,
  },
) => {
  mockGetBoundingClientRect();
  const settings = createMockSettings(props);

  const collection = createMockCollection({
    id: 1,
    name: "Good Collection",
  });

  setupCollectionsEndpoints({
    collections: [collection],
  });

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

  setupPropertiesEndpoints(settings);
  setupCurrentUserEndpoint(
    createMockUser({
      id: 1,
      email: "dude@aol.com",
    }),
  );

  setupDashboardEndpoints(
    createMockDashboard({
      id: 4242,
      name: "My dashboard",
    }),
  );

  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "custom-homepage",
      description: "Pick one of your dashboards",
      value: false,
    }),
    createMockSettingDefinition({
      key: "custom-homepage-dashboard",
      value: null,
    }),
    createMockSettingDefinition({
      key: "dismissed-custom-dashboard-toast",
      value: false,
    }),
  ]);

  return renderWithProviders(
    <div>
      <CustomHomepageDashboardSetting />
      <UndoListing />
    </div>,
  );
};

describe("CustomHomepageDashboardSetting", () => {
  it("should render a Custom homepage toggle", async () => {
    setup();
    expect(await screen.findByText("Custom homepage")).toBeInTheDocument();
    expect(
      await screen.findByText(/Pick one of your dashboards/),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.queryByText("Pick a dashboard")).not.toBeInTheDocument();
  });

  it("should render dashboard picker if toggle is on", async () => {
    setup({ "custom-homepage": true });
    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeChecked();
    });
    expect(screen.getByText("Pick a dashboard")).toBeInTheDocument();
  });

  it("should update the toggle value", async () => {
    setup({ "custom-homepage": false });
    const toggle = await screen.findByRole("switch");
    setupPropertiesEndpoints(createMockSettings({ "custom-homepage": true }));
    await userEvent.click(toggle);
    expect(await screen.findByRole("switch")).toBeChecked();

    const [{ url, body }] = await findRequests("PUT");
    expect(url).toContain("/api/setting/custom-homepage");
    expect(body).toEqual({ value: true });
  });

  it("should show selected dashboard name", async () => {
    setup({ "custom-homepage": true, "custom-homepage-dashboard": 4242 });
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
  });

  it("should update the dashboard value", async () => {
    setup({ "custom-homepage": true });
    const dashboardSelector = await screen.findByText("Pick a dashboard");
    await userEvent.click(dashboardSelector);

    await screen.findByText("Choose a dashboard"); // modal opens
    setupPropertiesEndpoints(
      createMockSettings({
        "custom-homepage": true,
        "custom-homepage-dashboard": 4242,
      }),
    );

    await userEvent.click(await screen.findByText(/My dashboard/));
    await waitFor(() => {
      // modal closes
      expect(screen.queryByText("Choose a dashboard")).not.toBeInTheDocument();
    });

    const [{ url: putUrl, body: putBody }, { url: putUrl2, body: putBody2 }] =
      await findRequests("PUT");
    expect(putUrl).toContain("/api/setting/custom-homepage-dashboard");
    expect(putBody).toEqual({ value: 4242 });
    expect(putUrl2).toContain("/api/setting/dismissed-custom-dashboard-toast");
    expect(putBody2).toEqual({ value: true });

    // dashboard name should be displayed
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
  });

  it("should hide dashboard selector when toggling off", async () => {
    setup({ "custom-homepage": true, "custom-homepage-dashboard": 4242 });
    const toggle = await screen.findByRole("switch");
    setupPropertiesEndpoints(createMockSettings({ "custom-homepage": false }));
    await userEvent.click(toggle);
    expect(await screen.findByRole("switch")).not.toBeChecked();
    expect(screen.queryByText(/my dashboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Pick a dashboard")).not.toBeInTheDocument();
  });

  it("should refresh current user after updating settings", async () => {
    setup({ "custom-homepage": true });
    const dashboardSelector = await screen.findByText("Pick a dashboard");
    await userEvent.click(dashboardSelector);

    await userEvent.click(await screen.findByText(/My dashboard/));

    await waitFor(() => {
      const calls = fetchMock.callHistory.calls();
      const userCall = calls.find((call) =>
        call.url?.includes("/api/user/current"),
      );
      expect(userCall).toBeDefined();
    });
  });
});
