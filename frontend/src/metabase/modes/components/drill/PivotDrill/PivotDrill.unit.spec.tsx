import { render, screen } from "__support__/ui";
import {
  createSampleDatabase,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS_ID,
} from "metabase-types/api/mocks/presets";
import { checkNotNull } from "metabase/core/utils/types";
import { createMockMetadata } from "__support__/metadata";
import type { DatasetColumn } from "metabase-types/api";
import type { ClickActionProps } from "metabase-lib/queries/drills/types";
import { PivotDrill } from "./PivotDrill";

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

function setupUnaggregatedQuery(): ClickActionProps {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const table = checkNotNull(metadata.table(PRODUCTS_ID));
  const question = checkNotNull(table.question());

  const clicked = {
    column: table.fields?.[0]?.column() as DatasetColumn,
    value: 42,
    dimensions: [
      {
        column: table.fields?.[0]?.column() as DatasetColumn,
        value: 42,
      },
    ],
  };

  return { question, clicked };
}

function setupCategoryFieldQuery(): ClickActionProps {
  const metadata = createMockMetadata({
    databases: [createSampleDatabase()],
  });

  const peopleTable = checkNotNull(metadata.table(PEOPLE_ID));

  const query = peopleTable
    .query()
    .aggregate(["count"])
    .breakout(["field", PEOPLE.STATE, null]);

  const question = query.question();

  const clicked = {
    column: query.aggregationDimensions()[0].column() as DatasetColumn,
    value: 194,
    dimensions: [
      {
        column: checkNotNull(metadata.field(PEOPLE.STATE))
          .dimension()
          .column() as DatasetColumn,
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
    onClick: jest.fn(),
    onChangeCardAndRun: jest.fn(),
    onChange: jest.fn(),
    onResize: jest.fn(),
    onClose: jest.fn(),
  };

  render(<PopoverComponent {...props} />);
}
