import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupGeoJSONEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import type {
  CustomGeoJSONMap,
  CustomGeoJSONSetting,
} from "metabase-types/api";
import {
  createMockGeoJSONFeatureCollection,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { CustomGeoJSONWidget } from "./CustomGeoJSONWidget";

const CUSTOM_GEO_JSON = {
  "666c2779-15ee-0ad9-f5ab-0ccbcc694efa": {
    name: "Test",
    url: "https://test.com/download/GeoJSON_one.json",
    region_key: "POLICY_NO",
    region_name: "TABLE_NAME",
  },
  us_states: {
    name: "United States",
    url: "app/assets/geojson/us-states.json",
    region_key: "STATE",
    region_name: "NAME",
    builtin: true,
  },
  world_countries: {
    name: "World",
    url: "app/assets/geojson/world.json",
    region_key: "ISO_A2",
    region_name: "NAME",
    builtin: true,
  },
};

const setup = async ({
  customGeoJSON = CUSTOM_GEO_JSON,
  isEnvVar,
}: {
  customGeoJSON?: CustomGeoJSONSetting;
  isEnvVar?: boolean;
}) => {
  const settings = createMockSettings({
    "custom-geojson": customGeoJSON,
  });

  const geoJSONDefinition = createMockSettingDefinition({
    key: "custom-geojson",
    value: customGeoJSON,
    is_env_setting: isEnvVar,
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([geoJSONDefinition]);
  setupGeoJSONEndpoint({
    featureCollection: createMockGeoJSONFeatureCollection(),
    url: "https://test.com/download/GeoJSON_one.json",
  });

  setupGeoJSONEndpoint({
    featureCollection: createMockGeoJSONFeatureCollection(),
    url: "https://test.com/download/GeoJSON_two.json",
  });

  renderWithProviders(
    <div>
      <CustomGeoJSONWidget />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  if (!isEnvVar) {
    await screen.findByRole("button", { name: "Add a map" });
  }
};

describe("CustomGeoJSONWIdget", () => {
  it("renders correctly", async () => {
    await setup({});
    const tableRows = screen.getAllByRole("row");

    // first row contains the table headers
    tableRows.slice(1).forEach((row) => {
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("Test");
      expect(cells[1]).toHaveTextContent(
        "https://test.com/download/GeoJSON_one.json",
      );
    });
    expect(
      screen.getByRole("button", { name: "Add a map" }),
    ).toBeInTheDocument();

    expect(screen.getByText("Custom maps")).toBeInTheDocument();
  });

  it("renders empty state", async () => {
    const { "666c2779-15ee-0ad9-f5ab-0ccbcc694efa": _, ...customGeoJSON } =
      CUSTOM_GEO_JSON;
    await setup({ customGeoJSON });

    expect(screen.queryByRole("row")).not.toBeInTheDocument();
    expect(screen.getByText("No custom maps yet")).toBeInTheDocument();
  });

  it("should remove a saved map", async () => {
    await setup({});

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();
    const confirmButton = within(modal).getByRole("button", { name: "Yes" });
    await userEvent.click(confirmButton);
    expect(modal).not.toBeInTheDocument();

    const puts = await findRequests("PUT");
    const { body } = puts[0];
    expect(body).toEqual({ value: {} });
  });

  it("should add a new map", async () => {
    await setup({});

    const addButton = screen.getByRole("button", { name: "Add a map" });
    await userEvent.click(addButton);
    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();

    // Save only becomes enabled when all the fields are filled in
    const saveButton = screen.getByRole("button", { name: /Add map/i });
    expect(saveButton).toBeDisabled();

    // Add Map Name
    const nameInput = screen.getByPlaceholderText(
      /e.g. United Kingdom, Brazil, Mars/i,
    );
    await userEvent.type(nameInput, "Test Two");

    // Load is disabled until URL is added
    expect(await screen.findByRole("button", { name: /Load/i })).toBeDisabled();

    // Add Map URL
    const urlInput = screen.getByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    );
    const loadButton = await screen.findByRole("button", { name: /Load/i });
    expect(loadButton).toBeDisabled();
    await userEvent.type(
      urlInput,
      "https://test.com/download/GeoJSON_two.json",
    );
    expect(loadButton).toBeEnabled();

    // Load Map
    await userEvent.click(loadButton);

    // Still more fields required
    expect(saveButton).toBeDisabled();

    // Select map features for key and name
    const keySelect = within(screen.getByTestId("map-region-key-select"));
    await userEvent.click(await keySelect.findByTestId("select-button"));
    await userEvent.click(await screen.findByText("scalerank"));

    const nameSelect = within(screen.getByTestId("map-region-name-select"));
    await userEvent.click(await nameSelect.findByTestId("select-button"));
    await userEvent.click(screen.getByText("featureclass"));

    // Save and check body contains data
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);
    expect(modal).not.toBeInTheDocument();

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    const { body } = puts[0];
    const testMapEntry = Object.values(body.value).find(
      (item) => (item as CustomGeoJSONMap).name === "Test Two",
    );
    expect(testMapEntry).toEqual({
      name: "Test Two",
      region_key: "scalerank",
      region_name: "featureclass",
      url: "https://test.com/download/GeoJSON_two.json",
    });
  });

  it("should edit a map", async () => {
    await setup({});

    await userEvent.click(
      screen.getByText("https://test.com/download/GeoJSON_one.json"),
    );

    const modal = screen.getByRole("dialog");
    expect(modal).toBeInTheDocument();
    expect(screen.getByText("Edit map")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Cancel/i }));

    const putsAfterCancel = await findRequests("PUT");
    expect(putsAfterCancel).toHaveLength(0);

    await userEvent.click(
      screen.getByText("https://test.com/download/GeoJSON_one.json"),
    );
    await userEvent.type(screen.getByDisplayValue("Test"), " Edit");

    const urlInput = screen.getByDisplayValue(
      "https://test.com/download/GeoJSON_one.json",
    );
    await userEvent.clear(urlInput);
    await userEvent.type(
      urlInput,
      "https://test.com/download/GeoJSON_two.json",
    );

    await userEvent.click(screen.getByRole("button", { name: /Refresh/i }));

    // Select map features for key and name
    const keySelect = within(screen.getByTestId("map-region-key-select"));
    await userEvent.click(await keySelect.findByTestId("select-button"));
    await userEvent.click(await screen.findByText("featureclass"));

    const nameSelect = within(screen.getByTestId("map-region-name-select"));
    await userEvent.click(await nameSelect.findByTestId("select-button"));
    await userEvent.click(screen.getByText("scalerank"));

    await userEvent.click(screen.getByRole("button", { name: /Save map/i }));

    expect(modal).not.toBeInTheDocument();

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    const { body } = puts[0];
    const testMapEntry = Object.values(body.value).find(
      (item) => (item as CustomGeoJSONMap).name === "Test Edit",
    );
    expect(testMapEntry).toEqual({
      name: "Test Edit",
      region_key: "featureclass",
      region_name: "scalerank",
      url: "https://test.com/download/GeoJSON_two.json",
    });
  });

  it("should not render the widget if set by an environment variable", async () => {
    await setup({
      isEnvVar: true,
    });

    expect(
      screen.queryByRole("button", { name: "Add a map" }),
    ).not.toBeInTheDocument();
  });
});
