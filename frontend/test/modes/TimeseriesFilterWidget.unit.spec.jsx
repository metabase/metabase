/* eslint-disable flowtype/require-valid-file-annotation */
import React from "react";
import TimeseriesFilterWidget from "metabase/qb/components/TimeseriesFilterWidget";
import { mount } from "enzyme";

import Question from "metabase-lib/lib/Question";
import {
  DATABASE_ID,
  ORDERS_TABLE_ID,
  metadata,
} from "__support__/sample_dataset_fixture";

const getTimeseriesFilterWidget = question => (
  <TimeseriesFilterWidget
    card={question.card()}
    tableMetadata={question.tableMetadata()}
    datasetQuery={question.query().datasetQuery()}
    setDatasetQuery={() => {}}
  />
);

describe("TimeseriesFilterWidget", () => {
  const questionWithoutFilter = Question.create({
    databaseId: DATABASE_ID,
    tableId: ORDERS_TABLE_ID,
    metadata,
  })
    .query()
    .addAggregation(["count"])
    .addBreakout(["datetime-field", ["field-id", 1], "day"])
    .question();

  it("should display 'All Time' text if no filter is selected", () => {
    const widget = mount(getTimeseriesFilterWidget(questionWithoutFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("All Time");
  });
  it("should display 'Past 30 Days' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .addFilter(["time-interval", ["field-id", 1], -30, "day"])
      .question();

    const widget = mount(getTimeseriesFilterWidget(questionWithFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("Past 30 Days");
  });
  it("should display 'Is Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .addFilter(["is-null", ["field-id", 1]])
      .question();

    const widget = mount(getTimeseriesFilterWidget(questionWithFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("Is Empty");
  });
  it("should display 'Not Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .addFilter(["not-null", ["field-id", 1]])
      .question();

    const widget = mount(getTimeseriesFilterWidget(questionWithFilter));
    expect(widget.find(".AdminSelect-content").text()).toBe("Not Empty");
  });
});
