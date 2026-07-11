import { renderHookWithProviders } from "__support__/ui";
import {
  createMockDashboardState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { CrossFilterClickBehavior } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDashboardCard,
  createMockDataset,
} from "metabase-types/api/mocks";

import { useClickMappingsData } from "./hooks";

const DASHCARD_ID = 1;
const CARD_ID = 10;

// Columns as they appear in the *live* pivot query result (dashcardData).
// This includes the synthetic "pivot-grouping" column that must never be
// offered as a click-behavior source.
const LIVE_COLUMNS = [
  createMockColumn({ name: "TITLE", display_name: "Product → Title" }),
  createMockColumn({ name: "SOURCE", display_name: "User → Source" }),
  createMockColumn({ name: "distinct", display_name: "Distinct values of ID" }),
  createMockColumn({ name: "pivot-grouping", display_name: "pivot-grouping" }),
];

// A *different*, stale/invalid column set stored on the card. Before the fix
// (metabase#52339) the source options were derived from here, which produced
// invalid options for pivot table dashcards.
const STALE_RESULT_METADATA = [
  createMockColumn({ name: "STALE", display_name: "Stale column" }),
];

const setup = () => {
  const dashcard = createMockDashboardCard({
    id: DASHCARD_ID,
    card_id: CARD_ID,
    card: createMockCard({
      id: CARD_ID,
      display: "pivot",
      result_metadata: STALE_RESULT_METADATA,
    }),
  });

  const clickBehavior: CrossFilterClickBehavior = {
    type: "crossfilter",
    parameterMapping: {},
  };

  const storeInitialState = createMockState({
    dashboard: createMockDashboardState({
      dashcardData: {
        [DASHCARD_ID]: {
          [CARD_ID]: createMockDataset({ data: { cols: LIVE_COLUMNS } }),
        },
      },
    }),
  });

  return renderHookWithProviders(
    () =>
      useClickMappingsData({
        object: undefined,
        dashcard,
        isDashboard: false,
        clickBehavior,
        updateSettings: jest.fn(),
      }),
    { storeInitialState },
  );
};

describe("useClickMappingsData (metabase#52339)", () => {
  it("derives column source options from the live dashcard query result, not stale card result_metadata", () => {
    const { result } = setup();

    const columnNames = result.current.sourceOptions.column.map(
      (col) => col.display_name,
    );

    expect(columnNames).toEqual([
      "Product → Title",
      "User → Source",
      "Distinct values of ID",
    ]);
  });

  it("excludes the synthetic pivot-grouping column from source options", () => {
    const { result } = setup();

    const columnNames = result.current.sourceOptions.column.map(
      (col) => col.name,
    );

    expect(columnNames).not.toContain("pivot-grouping");
  });

  it("does not offer stale result_metadata columns as source options", () => {
    const { result } = setup();

    const columnNames = result.current.sourceOptions.column.map(
      (col) => col.name,
    );

    expect(columnNames).not.toContain("STALE");
  });
});
