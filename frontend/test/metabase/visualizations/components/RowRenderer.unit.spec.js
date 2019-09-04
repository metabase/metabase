import "__support__/mocks";

import {
  createFixture,
  cleanupFixture,
  renderChart,
  NumberColumn,
  StringColumn,
} from "../__support__/visualizations";

import rowRenderer from "metabase/visualizations/lib/RowRenderer";

describe("RowChart", () => {
  let element;

  beforeEach(function() {
    element = createFixture();
  });

  afterEach(function() {
    cleanupFixture(element);
  });

  it("should render", () => {
    renderChart(rowRenderer, element, [
      {
        card: { display: "row", visualization_settings: {} },
        data: { cols: [StringColumn(), NumberColumn()], rows: [["a", 1]] },
      },
    ]);
  });

  it('should render null as "(empty)"', () => {
    renderChart(rowRenderer, element, [
      {
        card: { display: "row", visualization_settings: {} },
        data: { cols: [StringColumn(), NumberColumn()], rows: [[null, 1]] },
      },
    ]);

    expect(element.querySelector("text.row").innerHTML).toBe("(empty)");
  });
});
