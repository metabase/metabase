import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { ORDERS } from "__support__/sample_dataset_fixture";
import PivotByDrill from "metabase/modes/components/drill/PivotByDrill";

describe("PivotByDrill", () => {
  it("should return a broken out card", () => {
    const TestPivotByDrill = PivotByDrill("Test", "test", () => true);

    const countQuestion = ORDERS.query()
      .aggregate(["count"])
      .question()
      .setDisplay("scalar");

    const actions = TestPivotByDrill({ question: countQuestion });
    expect(actions).toHaveLength(1);

    const PopoverComponent = actions[0].popover;

    const onChangeCardAndRun = jest.fn();
    render(<PopoverComponent onChangeCardAndRun={onChangeCardAndRun} />);
    fireEvent.click(screen.getAllByText("Created At")[0]);

    expect(onChangeCardAndRun).toHaveBeenLastCalledWith({
      nextCard: {
        dataset_query: {
          database: 1,
          query: {
            "source-table": ORDERS.id,
            aggregation: [["count"]],
            breakout: [["field", 1, { "temporal-unit": "day" }]],
          },
          type: "query",
        },
        display: "line",
        name: undefined,
        visualization_settings: {},
      },
    });
  });
});
