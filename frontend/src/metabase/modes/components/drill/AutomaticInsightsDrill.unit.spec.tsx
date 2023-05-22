import React from "react";
import { renderWithProviders, screen } from "__support__/ui";
import { DatasetColumn } from "metabase-types/api";
import MetabaseSettings from "metabase/lib/settings";
import { createMockMetadata } from "__support__/metadata";
import {
  createSampleDatabase,
  PEOPLE,
  PEOPLE_ID,
} from "metabase-types/api/mocks/presets";
import { checkNotNull } from "metabase/core/utils/types";
import type { ClickActionProps } from "metabase-lib/queries/drills/types";
import { AutomaticInsightsDrill } from "./AutomaticInsightsDrill";

describe("AutomaticInsightsDrill", () => {
  describe('"enable-xrays" feature is disabled', () => {
    beforeAll(() => {
      MetabaseSettings.set("enable-xrays", false);
    });

    afterAll(() => {
      MetabaseSettings.set("enable-xrays", true);
    });

    it("should return empty array", () => {
      const actions = AutomaticInsightsDrill(setupCategoryFieldQuery());

      expect(actions).toHaveLength(0);
    });
  });

  it("should return one item with popover", () => {
    const actions = AutomaticInsightsDrill(setupCategoryFieldQuery());

    expect(actions).toHaveLength(1);

    const { title, popover } = actions[0];
    expect(title).toBe("Automatic insights…");
    expect(popover).toBeTruthy();
  });

  describe("drill popover", () => {
    it("should render title and options", () => {
      setup();

      expect(screen.getByText("Automatic insights…")).toBeInTheDocument();
      expect(screen.getByText("Compare to the rest")).toBeInTheDocument();
      expect(screen.getByText("X-ray")).toBeInTheDocument();
    });
  });
});

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
  const actions = AutomaticInsightsDrill(setupCategoryFieldQuery());
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

  renderWithProviders(<PopoverComponent {...props} />);
}
