import React from "react";
import { PEOPLE } from "__support__/sample_database_fixture";
import { renderWithProviders, screen } from "__support__/ui";
import { DatasetColumn } from "metabase-types/api";
import MetabaseSettings from "metabase/lib/settings";
import AutomaticInsightsDrill from "./AutomaticInsightsDrill";

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
  const actions = AutomaticInsightsDrill(setupCategoryFieldQuery());
  expect(actions).toHaveLength(1);

  const { popover: PopoverComponent } = actions[0];

  const props = {
    series: [],
    onChangeCardAndRun: jest.fn(),
    onChange: jest.fn(),
    onResize: jest.fn(),
    onClose: jest.fn(),
  };

  renderWithProviders(<PopoverComponent {...props} />);
}
