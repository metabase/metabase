import React from "react";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";
import { render, screen } from "@testing-library/react";

import Question from "metabase-lib/lib/Question";
import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";

const getTimeseriesFilterWidget = question => (
  <TimeseriesFilterWidget
    question={question}
    card={question.card()}
    query={question.query()}
    setDatasetQuery={() => {}}
  />
);

describe("TimeseriesFilterWidget", () => {
  const questionWithoutFilter = Question.create({
    databaseId: SAMPLE_DATABASE.id,
    tableId: ORDERS.id,
    metadata,
  })
    .query()
    .aggregate(["count"])
    .breakout(["field", 1, { "temporal-unit": "day" }])
    .question();

  it("should display 'All Time' text if no filter is selected", () => {
    render(getTimeseriesFilterWidget(questionWithoutFilter));
    screen.getByText(/All Time/i);
  });

  it("should display 'Previous 30 Days' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["time-interval", ["field", 1, null], -30, "day"])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    screen.getByText(/Previous 30 Days/i);
  });

  it("should display 'Is Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["is-null", ["field", 1, null]])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    screen.getByText(/Is Empty/i);
  });

  it("should display 'Not Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["not-null", ["field", 1, null]])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    screen.getByText(/Not Empty/i);
  });
});
