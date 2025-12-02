import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import { useAdminSetting, useAdminSettings } from "./settings";

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

const TestMultipleSettingsComponent = () => {
  const { values, details, updateSettings, isLoading } = useAdminSettings([
    "site-name",
    "site-url",
  ] as const);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <div data-testid="values">{JSON.stringify(values)}</div>
      <div data-testid="details">{JSON.stringify(details)}</div>
      <button
        onClick={async () => {
          await updateSettings({ "site-name": "Updated Site Name" });
        }}
      >
        change site name
      </button>
    </div>
  );
};

const setupMultipleSettings = async () => {
  setupPropertiesEndpoints(
    createMockSettings({
      "site-name": "Metabased",
      "site-url": "https://metabase.com",
    }),
  );
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "site-name",
      is_env_setting: true,
      env_name: "MB_SPECIAL_SITE_NAME",
    }),
    createMockSettingDefinition({
      key: "site-url",
      is_env_setting: false,
    }),
  ]);
  setupUpdateSettingsEndpoint();
  renderWithProviders(<TestMultipleSettingsComponent />);
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

    const apiCalls = fetchMock.callHistory.calls();
    const putCall = apiCalls.find((call) => call.request?.method === "PUT");

    expect(putCall?.request?.url).toContain("/api/setting/site-name");
  });
});

describe("useAdminSettings", () => {
  it("should have loading state", async () => {
    await setupMultipleSettings();

    expect(screen.getByText("Loading...")).toBeInTheDocument();

    await waitFor(async () => {
      expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
    });
  });

  it("should get multiple setting values", async () => {
    await setupMultipleSettings();

    const valuesElement = await screen.findByTestId("values");

    expect(valuesElement).toHaveTextContent(
      JSON.stringify({ "site-name": true, "site-url": true }),
    );
  });

  it("should get multiple setting details", async () => {
    await setupMultipleSettings();

    const detailsElement = await screen.findByTestId("details");

    expect(detailsElement).toHaveTextContent(/site\-name/);
    expect(detailsElement).toHaveTextContent(/site\-url/);
    expect(detailsElement).toHaveTextContent(/MB_SPECIAL_SITE_NAME/);
  });

  it("should allow setting mutation", async () => {
    await setupMultipleSettings();
    const updateButton = await screen.findByText("change site name");

    await userEvent.click(updateButton);

    const apiCalls = fetchMock.callHistory.calls();
    const putCall = apiCalls.find((call) => call.request?.method === "PUT");
    expect(putCall?.request?.url).toMatch(/\/api\/setting/);
  });
});
