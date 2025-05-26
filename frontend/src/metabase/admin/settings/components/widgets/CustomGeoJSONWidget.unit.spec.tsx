import userEvent from "@testing-library/user-event";

import {
  setupGeoJSONEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { findRequests } from "__support__/utils";
import { UndoListing } from "metabase/containers/UndoListing";
import type { CustomGeoJSONMap } from "metabase-types/api";
import {
  createMockGeoJSONFeatureCollection,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";

import CustomGeoJSONWidget from "./CustomGeoJSONWidget";

const setup = ({ isEnvVar }: { isEnvVar?: boolean }) => {
  const customGeoJSON = {
    "666c2779-15ee-0ad9-f5ab-0ccbcc694efa": {
      name: "Test",
      url: "https://dataworks.calderdale.gov.uk/download/23331/080/Green Belt GeoJSON.json",
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
    url: "https://test.com/download/GeoJSON.json",
  });

  return renderWithProviders(
    <div>
      <CustomGeoJSONWidget
        setting={geoJSONDefinition}
        reloadSettings={() => {}}
      />
      <UndoListing />
    </div>,
  );
};

describe("CustomGeoJSONWIdget", () => {
  it("render correctly", async () => {
    setup({});
    const tableRows = screen.getAllByRole("row");

    // first row contains the table headers
    tableRows.slice(1).forEach((row) => {
      const cells = within(row).getAllByRole("cell");
      expect(cells[0]).toHaveTextContent("Test");
      expect(cells[1]).toHaveTextContent(
        "https://dataworks.calderdale.gov.uk/download/23331/080/Green Belt GeoJSON.json",
      );
    });
    expect(
      screen.getByRole("button", { name: "Add a map" }),
    ).toBeInTheDocument();
  });

  it("should remove a saved map", async () => {
    setup({});

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

  it("should save an updated setting", async () => {
    setup({});

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
    await userEvent.type(nameInput, "Test Map");

    // Load is disabled until URL is added
    expect(await screen.findByRole("button", { name: /Load/i })).toBeDisabled();

    // Add Map URL
    const urlInput = screen.getByPlaceholderText(
      "Like https://my-mb-server.com/maps/my-map.json",
    );
    const loadButton = await screen.findByRole("button", { name: /Load/i });
    expect(loadButton).toBeDisabled();
    await userEvent.type(urlInput, "https://test.com/download/GeoJSON.json");
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

    const puts = await findRequests("PUT");
    const { body } = puts[0];
    const testMapEntry = Object.values(body.value).find(
      (item) => (item as CustomGeoJSONMap).name === "Test Map",
    );
    expect(testMapEntry).toEqual({
      name: "Test Map",
      region_key: "scalerank",
      region_name: "featureclass",
      url: "https://test.com/download/GeoJSON.json",
    });
  });

  it("should not render the widget if set by an environment variable", async () => {
    setup({
      isEnvVar: true,
    });

    expect(
      screen.queryByRole("button", { name: "Add a map" }),
    ).not.toBeInTheDocument();
  });
});
