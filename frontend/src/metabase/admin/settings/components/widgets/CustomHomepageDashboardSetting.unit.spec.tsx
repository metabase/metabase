import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCurrentUserEndpoint,
  setupDashboardEndpoints,
  setupPropertiesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { UndoListing } from "metabase/containers/UndoListing";
import {
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
  const settings = createMockSettings(props);

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
    expect(await screen.findByText("Custom Homepage")).toBeInTheDocument();
    expect(
      await screen.findByText(/Pick one of your dashboards/),
    ).toBeInTheDocument();
    expect(screen.getByRole("switch")).toBeInTheDocument();
    expect(screen.getByRole("switch")).not.toBeChecked();
    expect(screen.queryByText(/select a dashboard/i)).not.toBeInTheDocument();
  });

  it("should render dashboard picker if toggle is on", async () => {
    setup({ "custom-homepage": true });
    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeChecked();
    });
    expect(screen.getByText(/select a dashboard/i)).toBeInTheDocument();
  });

  it("should update the toggle value", async () => {
    setup({ "custom-homepage": false });
    const toggle = await screen.findByRole("switch");
    setupPropertiesEndpoints(createMockSettings({ "custom-homepage": true }));
    await userEvent.click(toggle);
    expect(await screen.findByRole("switch")).toBeChecked();

    const [[putUrl, putDetails]] = await findPuts();
    expect(putUrl).toContain("/api/setting/custom-homepage");
    expect(putDetails).toEqual({ value: true });
  });

  it("should show selected dashboard name", async () => {
    setup({ "custom-homepage": true, "custom-homepage-dashboard": 4242 });
    expect(await screen.findByText("My dashboard")).toBeInTheDocument();
  });

  it("should update the dashboard value", async () => {
    setup({ "custom-homepage": true });
    const dashboardSelector = await screen.findByText(/select a dashboard/i);
    await userEvent.click(dashboardSelector);

    await screen.findByText("Choose a dashboard"); // modal opens
    setupPropertiesEndpoints(
      createMockSettings({
        "custom-homepage": true,
        "custom-homepage-dashboard": 4242,
      }),
    );
    await userEvent.click(screen.getByText("My dashboard"));
    await waitFor(() => {
      // modal closes
      expect(screen.queryByText("Choose a dashboard")).not.toBeInTheDocument();
    });

    const [[putUrl, putDetails], [putUrl2, putDetails2]] = await findPuts();

    expect(putUrl).toContain("/api/setting/custom-homepage-dashboard");
    expect(putDetails).toEqual({ value: 4242 });
    expect(putUrl2).toContain("/api/setting/dismissed-custom-dashboard-toast");
    expect(putDetails2).toEqual({ value: true });

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
    expect(screen.queryByText(/select a dashboard/i)).not.toBeInTheDocument();
  });

  it("should refresh current user after updating settings", async () => {
    setup({ "custom-homepage": true });
    const dashboardSelector = await screen.findByText(/select a dashboard/i);
    await userEvent.click(dashboardSelector);

    await userEvent.click(await screen.findByText("My dashboard"));

    await waitFor(() => {
      const calls = fetchMock.calls();
      const userCall = calls.find((call) =>
        call[0].includes("/api/user/current"),
      );
      expect(userCall).toBeDefined();
    });
  });
});

async function findPuts() {
  const calls = fetchMock.calls();
  const data = calls.filter((call) => call[1]?.method === "PUT") ?? [];

  const puts = data.map(async ([putUrl, putDetails]) => {
    const body = ((await putDetails?.body) as string) ?? "{}";

    return [putUrl, JSON.parse(body ?? "{}")];
  });

  return Promise.all(puts);
}
