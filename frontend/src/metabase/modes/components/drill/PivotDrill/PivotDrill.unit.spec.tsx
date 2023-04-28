import React from "react";
import { createMockState } from "metabase-types/store/mocks";
import { createEntitiesState } from "__support__/store";
import { render, screen } from "__support__/ui";
import {
  createSampleDatabase,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/core/utils/types";
import { PEOPLE } from "__support__/sample_database_fixture";
import { DatasetColumn } from "metabase-types/api";
import PivotDrill from "./PivotDrill";

describe("PivotDrill", () => {
  it("returns empty array for query without aggregations", () => {
    const actions = PivotDrill(setupUnaggregatedQuery());

    expect(actions).toHaveLength(0);
  });

  it('returns "Breakout by" title', () => {
    const actions = PivotDrill(setupCategoryFieldQuery());

    expect(actions).toHaveLength(1);
    expect(actions[0].title).toBe("Break out by…");
  });

  describe("popover", () => {
    it("returns popover with breakout type options", () => {
      setup();

      expect(screen.getByText("Time")).toBeInTheDocument();
      expect(screen.getByText("Location")).toBeInTheDocument();
      expect(screen.getByText("Category")).toBeInTheDocument();
    });
  });
});

function setupUnaggregatedQuery() {
  const state = createMockState({
    entities: createEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  const metadata = getMetadata(state);
  const table = checkNotNull(metadata.table(PRODUCTS_ID));
  const question = checkNotNull(table.question());

  const clicked = {
    column: table.fields[0].column(),
    value: 42,
    dimensions: [
      {
        column: table.fields[0].column(),
        value: 42,
      },
    ],
  };

  return { question, clicked };
}

function setupCategoryFieldQuery() {
  const query = PEOPLE.query()
    .aggregate(["count"])
    .breakout(["field", PEOPLE.STATE.id, null]);

  const question = query.question();

  const clicked = {
    column: query.aggregationDimensions()[0].column(),
    value: 194,
    dimensions: [
      {
        column: PEOPLE.STATE.dimension().column() as DatasetColumn,
        value: "TX",
      },
    ],
  };

  return { question, clicked };
}

function setup() {
  const actions = PivotDrill(setupCategoryFieldQuery());
  expect(actions).toHaveLength(1);

  const { popover: PopoverComponent } = actions[0];

  const props = {
    series: [],
    onChangeCardAndRun: jest.fn(),
    onChange: jest.fn(),
    onResize: jest.fn(),
    onClose: jest.fn(),
  };

  render(<PopoverComponent {...props} />);
}
