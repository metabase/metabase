import { queryIcon, renderWithProviders } from "__support__/ui";
import { createMockSettingsState } from "metabase-types/store/mocks";
import Visualization from "metabase/visualizations/components/Visualization";

const RAW_SERIES = [
  {
    card: {
      display: "map",
    },
    data: {
      rows: [
        [-170, 50, 6],
        [-170, 60, 3],
        [-160, 50, 7],
        [-160, 60, 19],
        [-150, 60, 29],
        [-140, 50, 3],
        [-130, 30, 53],
        [-130, 40, 51],
        [-120, 30, 60],
        [-120, 40, 125],
        [-110, 30, 129],
        [-110, 40, 193],
        [-100, 20, 57],
        [-100, 30, 361],
        [-100, 40, 396],
        [-90, 20, 29],
        [-90, 30, 443],
        [-90, 40, 221],
        [-80, 30, 130],
        [-80, 40, 169],
        [-70, 40, 14],
      ],
      cols: [
        {
          description:
            "This is the longitude of the user on sign-up. It might be updated in the future to the last seen location.",
          semantic_type: "type/Longitude",
          table_id: 161,
          coercion_strategy: null,
          binning_info: {
            min_value: -170,
            max_value: -60,
            num_bins: 11,
            bin_width: 10,
            binning_strategy: "bin-width",
          },
          name: "LONGITUDE",
          settings: null,
          source: "fields",
          field_ref: [
            "field",
            1338,
            {
              "base-type": "type/Float",
            },
          ],
          effective_type: "type/Float",
          nfc_path: null,
          parent_id: null,
          id: 1338,
          visibility_type: "normal",
          display_name: "Longitude",
          base_type: "type/Float",
        },
        {
          description:
            "This is the latitude of the user on sign-up. It might be updated in the future to the last seen location.",
          semantic_type: "type/Latitude",
          table_id: 161,
          coercion_strategy: null,
          binning_info: {
            min_value: 20,
            max_value: 80,
            num_bins: 6,
            bin_width: 10,
            binning_strategy: "bin-width",
          },
          name: "LATITUDE",
          settings: null,
          source: "fields",
          field_ref: [
            "field",
            1345,
            {
              "base-type": "type/Float",
            },
          ],
          effective_type: "type/Float",
          nfc_path: null,
          parent_id: null,
          id: 1345,
          visibility_type: "normal",
          display_name: "Latitude",
          base_type: "type/Float",
        },
        {
          field_ref: [
            "field",
            "count",
            {
              "base-type": "type/Integer",
            },
          ],
          base_type: "type/BigInteger",
          name: "count",
          display_name: "Count",
          semantic_type: "type/Quantity",
          source: "fields",
          effective_type: "type/BigInteger",
        },
      ],
    },
  },
];

const setup = async () => {
  return renderWithProviders(<Visualization rawSeries={RAW_SERIES} />, {
    storeInitialState: {
      settings: createMockSettingsState({
        "map-tile-server-url":
          "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      }),
    },
  });
};

describe("LeafletGridHeatMap", () => {
  it("should not crash (metabase#31058)", async () => {
    await setup();

    expect(queryIcon("warning")).not.toBeInTheDocument();
  });
});
