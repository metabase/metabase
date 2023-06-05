import { render, screen } from "@testing-library/react";
import { createMockMetadata } from "__support__/metadata";
import TimeseriesFilterWidget from "metabase/modes/components/TimeseriesFilterWidget";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import Question from "metabase-lib/Question";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

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
    databaseId: SAMPLE_DB_ID,
    tableId: ORDERS_ID,
    metadata,
  })
    .query()
    .aggregate(["count"])
    .breakout(["field", ORDERS.CREATED_AT, { "temporal-unit": "day" }])
    .question();

  it("should display 'All Time' text if no filter is selected", () => {
    render(getTimeseriesFilterWidget(questionWithoutFilter));
    expect(screen.getByText(/All Time/i)).toBeInTheDocument();
  });

  it("should display 'Previous 30 Days' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["time-interval", ["field", ORDERS.CREATED_AT, null], -30, "day"])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    expect(screen.getByText(/Previous 30 Days/i)).toBeInTheDocument();
  });

  it("should display 'Is Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["is-null", ["field", ORDERS.CREATED_AT, null]])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    expect(screen.getByText(/Is Empty/i)).toBeInTheDocument();
  });

  it("should display 'Not Empty' text if that filter is selected", () => {
    const questionWithFilter = questionWithoutFilter
      .query()
      .filter(["not-null", ["field", ORDERS.CREATED_AT, null]])
      .question();

    render(getTimeseriesFilterWidget(questionWithFilter));
    expect(screen.getByText(/Not Empty/i)).toBeInTheDocument();
  });
});
