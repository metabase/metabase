import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { useAdminSetting } from "./settings";

const TestComponent = () => {
  const { value, settingDetails, updateSetting, isLoading } =
    useAdminSetting("site-name");

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div>{JSON.stringify({ value, settingDetails })}</div>
      <button
        onClick={async () => {
          await updateSetting({
            key: "site-name",
            value: "New Site Name",
          });
        }}
      >
        change site name
      </button>
    </div>
  );
};

const setup = async () => {
  setupPropertiesEndpoints(createMockSettings({ "site-name": "Metabased" }));
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "site-name",
      is_env_setting: true,
      env_name: "MB_SPECIAL_SITE_NAME",
    }),
  ]);
  setupUpdateSettingEndpoint();
  renderWithProviders(<TestComponent />);
};

describe("useAdminSetting", () => {
  it("should have loading state", async () => {
    await setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await waitFor(async () => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  it("should get setting value", async () => {
    await setup();
    expect(await screen.findByText(/Metabased/)).toBeInTheDocument();
  });

  it("should get setting details", async () => {
    await setup();
    expect(
      await screen.findByText(/"is_env_setting":true/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/MB_SPECIAL_SITE_NAME/)).toBeInTheDocument();
  });

  it("should allow setting mutation", async () => {
    await setup();
    const updateButton = await screen.findByText("change site name");

    // should update on refetch
    setupPropertiesEndpoints(
      createMockSettings({ "site-name": "New Site Name" }),
    );

    await userEvent.click(updateButton);

    await waitFor(() => {
      expect(screen.getByText(/New Site Name/)).toBeInTheDocument();
    });

    const apiCalls = fetchMock.calls();
    const putCall = apiCalls.find(call => call[1]?.method === "PUT");

    expect(putCall?.[0]).toContain("/api/setting/site-name");
  });
});
