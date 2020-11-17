/* eslint-disable flowtype/require-valid-file-annotation */
import React from "react";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";
import { mount } from "enzyme";

import Question from "metabase-lib/lib/Question";
import {
  SAMPLE_DATASET,
  ORDERS,
  metadata,
} from "__support__/sample_dataset_fixture";

const getTimeseriesFilterWidget = question => (
  <TimeseriesFilterWidget
    card={question.card()}
    datasetQuery={question.query().datasetQuery()}
    setDatasetQuery={() => {}}
  />
);

describe("TimeseriesFilterWidget", () => {
  const questionWithoutFilter = Question.create({
    databaseId: SAMPLE_DATASET.id,
    tableId: ORDERS.id,
    metadata,
  })
    .query()
    .aggregate(["count"])
    .breakout(["datetime-field", ["field-id", 1], "day"])
    .question();

  it("should display 'All Time' text if no filter is selected", () => {
    const widget = mount(getTimeseriesFilterWidget(questionWithoutFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("All Time");
  });
  it("should display 'Previous 30 Days' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["time-interval", ["field-id", 1], -30, "day"])
      .question();

    const widget = mount(getTimeseriesFilterWidget(questionWithFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("Previous 30 Days");
  });
  it("should display 'Is Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["is-null", ["field-id", 1]])
      .question();

    const widget = mount(getTimeseriesFilterWidget(questionWithFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("Is Empty");
  });
  it("should display 'Not Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["not-null", ["field-id", 1]])
      .question();

    const widget = mount(getTimeseriesFilterWidget(questionWithFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("Not Empty");
  });
});
