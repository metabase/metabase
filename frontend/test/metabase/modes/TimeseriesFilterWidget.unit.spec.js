import React from "react";
import { render, screen } from "@testing-library/react";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";

import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import Question from "metabase-lib/Question";

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
    expect(screen.getByText(/All Time/i)).toBeInTheDocument();
  });

  it("should display 'Previous 30 Days' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["time-interval", ["field", 1, null], -30, "day"])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    expect(screen.getByText(/Previous 30 Days/i)).toBeInTheDocument();
  });

  it("should display 'Is Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["is-null", ["field", 1, null]])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    expect(screen.getByText(/Is Empty/i)).toBeInTheDocument();
  });

  it("should display 'Not Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["not-null", ["field", 1, null]])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    expect(screen.getByText(/Not Empty/i)).toBeInTheDocument();
  });
});
