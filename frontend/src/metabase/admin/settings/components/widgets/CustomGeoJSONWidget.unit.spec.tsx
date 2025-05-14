import userEvent from "@testing-library/user-event";

import {
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingEndpoint,
} from "__support__/server-mocks";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { findRequests } from "__support__/utils";
import { UndoListing } from "metabase/containers/UndoListing";
import {
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

    await userEvent.click(screen.getByRole("button", { name: /Add a map/i }));
    expect(
      screen.getByRole("button", { name: "Add a map" }),
    ).toBeInTheDocument();
  });

  it("should save an updated setting", async () => {
    setup({});

    const input = await screen.findByRole("textbox");
    await userEvent.clear(input);
    await userEvent.type(input, "responses@metatest.com");
    await fireEvent.blur(input);

    const inputChanged = await screen.findByRole("textbox");
    expect(inputChanged).toHaveValue("responses@metatest.com");

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    const { url: putUrl, body: putBody } = puts[0];
    expect(putUrl).toContain("/api/setting/email-reply-to");
    expect(putBody).toStrictEqual({ value: ["responses@metatest.com"] });
  });

  it("should display a notice instead of input set by an environment variable", async () => {
    setup({
      isEnvVar: true,
    });

    expect(
      await screen.findByText(/This has been set by the/),
    ).toBeInTheDocument();
    expect(screen.getByText("MB_EMAIL_REPLY_TO")).toBeInTheDocument();
    expect(screen.getByText(/environment variable./)).toBeInTheDocument();

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
});
