/* eslint-disable flowtype/require-valid-file-annotation */

import React from "react";

import { question } from "__support__/sample_dataset_fixture";

import { mount } from "enzyme";
import { click } from "__support__/enzyme_utils";

import PivotByAction from "metabase/modes/components/actions/PivotByAction";

describe("PivotByAction", () => {
  it("should return a broken out card", () => {
    const TestPivotByAction = PivotByAction("Test", "test", () => true);

    const countQuestion = question
      .query()
      .addAggregation(["count"])
      .question()
      .setDisplay("scalar");

    const actions = TestPivotByAction({ question: countQuestion });
    expect(actions).toHaveLength(1);

    const PopoverComponent = actions[0].popover;

    const onChangeCardAndRun = jest.fn();
    const wrapper = mount(
      <PopoverComponent onChangeCardAndRun={onChangeCardAndRun} />,
    );

    click(wrapper.find(".List-item a").first());

    expect(onChangeCardAndRun).toHaveBeenLastCalledWith({
      nextCard: {
        dataset_query: {
          database: 1,
          query: {
            aggregation: [["count"]],
            breakout: [["datetime-field", ["field-id", 1], "day"]],
            "source-table": 1,
          },
          type: "query",
        },
        display: "line",
        name: null,
        visualization_settings: {},
      },
    });
  });
});
