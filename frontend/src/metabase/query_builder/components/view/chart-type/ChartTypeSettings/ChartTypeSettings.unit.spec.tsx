import { screen, within } from "@testing-library/react";

describe("ChartTypeSettings", () => {
  it("should group sensible and nonsensible options separately and in the correct order", () => {
    setup();

    const sensible = within(
      screen.getByTestId("display-options-sensible"),
    ).getAllByTestId(/container/i);
    const nonSensible = within(
      screen.getByTestId("display-options-not-sensible"),
    ).getAllByTestId(/container/i);

    const sensibleOrder = ["Table", "Number", "Gauge", "Progress", "Detail"];
    const nonSensibleOrder = [
      "Bar",
      "Line",
      "Pie",
      "Row",
      "Area",
      "Combo",
      "Pivot Table",
      "Trend",
      "Funnel",
      "Map",
      "Scatter",
      "Waterfall",
    ];

    expect(sensible).toHaveLength(sensibleOrder.length);
    expect(nonSensible).toHaveLength(nonSensibleOrder.length);

    sensible.forEach((node, index) => {
      expect(node).toHaveTextContent(sensibleOrder[index]);
    });

    nonSensible.forEach((node, index) => {
      expect(node).toHaveTextContent(nonSensibleOrder[index]);
    });
  });
});
