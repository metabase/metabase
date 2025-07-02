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
import {
  createMockGeoJSONFeatureCollection,
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import { createMockSettingsState } from "metabase-types/store/mocks";

import { MapsSettingsPage } from "./MapsSettingsPage";

const setup = async () => {
  const customGeoJSON = {
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
  const settings = createMockSettings({
    "custom-geojson": customGeoJSON,
    "map-tile-server-url": "https://tiles.com",
  });

  setupPropertiesEndpoints(settings);
  setupUpdateSettingEndpoint();
  setupSettingsEndpoints([
    createMockSettingDefinition({
      key: "custom-geojson",
      value: customGeoJSON,
    }),
    createMockSettingDefinition({
      key: "map-tile-server-url",
      value: "https://tiles.com",
    }),
  ]);

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
      <MapsSettingsPage />
      <UndoListing />
    </div>,
    {
      storeInitialState: {
        settings: createMockSettingsState(settings),
      },
    },
  );

  await screen.findByRole("button", { name: "Add a map" });
};

describe("MapsSettingsPage", () => {
  it("should render the PublicSharingSettingsPage with public sharing disabled", async () => {
    await setup();
    ["Map tile server URL", "Custom maps"].forEach((text) => {
      expect(screen.getByText(text)).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("https://tiles.com")).toBeInTheDocument();
  });

  it("update multiple settings", async () => {
    await setup();
    expect(screen.queryByText("Shared Dashboards")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Questions")).not.toBeInTheDocument();
    expect(screen.queryByText("Shared Action Forms")).not.toBeInTheDocument();

    const urlInput = screen.getByDisplayValue("https://tiles.com");
    await userEvent.clear(urlInput);
    await userEvent.type(urlInput, "https://pokemontiles.com");

    await userEvent.click(screen.getByRole("button", { name: /Remove/i }));
    const modal = screen.getByRole("dialog");
    const confirmButton = within(modal).getByRole("button", { name: "Yes" });
    await userEvent.click(confirmButton);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(2);
    });

    await waitFor(() => {
      const toasts = screen.getAllByLabelText("check_filled icon");
      expect(toasts).toHaveLength(2);
    });

    const puts = await findRequests("PUT");
    const { url: tileServerPutUrl, body: tileServerPutBody } = puts[0];

    expect(tileServerPutUrl).toContain("/api/setting/map-tile-server-url");
    expect(tileServerPutBody).toEqual({ value: "https://pokemontiles.com" });

    const { url: geoJSONPutUrl, body: geoJSONPutBody } = puts[1];

    expect(geoJSONPutUrl).toContain("/api/setting/custom-geojson");
    expect(geoJSONPutBody).toEqual({ value: {} });
  });
});
