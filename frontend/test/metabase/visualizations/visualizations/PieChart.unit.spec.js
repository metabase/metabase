import React, { useState } from "react";
import { thaw } from "icepick";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "__support__/ui";

import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import ChartSettings from "metabase/visualizations/components/ChartSettings";

import Question from "metabase-lib/Question";

const setup = () => {
  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        {
          display: "pie",
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS.id,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT.id, { "temporal-unit": "year" }],
              ],
            },
          },
          database: SAMPLE_DATABASE.id,
          visualization_settings: {},
        },
        metadata,
      ),
    );

    const onChange = update => {
      setQuestion(q => {
        const newQuestion = q.updateSettings(update);
        return new Question(thaw(newQuestion.card()), metadata);
      });
    };

    return (
      <ChartSettings
        onChange={onChange}
        series={[
          {
            card: question.card(),
            data: {
              rows: [
                ["2016-01-01T00:00:00-04:00", 500],
                ["2017-01-01T00:00:00-04:00", 1500],
              ],
              cols: question.query().columns(),
            },
          },
        ]}
        initial={{ section: "Data" }}
        question={question}
      />
    );
  };

  renderWithProviders(<Container />);
};

describe("table settings", () => {
  beforeAll(() => {
    //Append mocked style for .hide class
    const mockedStyle = document.createElement("style");
    mockedStyle.innerHTML = `.hide {display: none;}`;
    document.body.append(mockedStyle);
  });
  it("should render", () => {
    setup();
    expect(screen.getByTestId("pie-chart")).toBeInTheDocument();
  });

  it("should allow you to show and hide the grand total", async () => {
    setup();

    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(() => ({
        height: 200,
        width: 200,
        x: 0,
        y: 0,
      }));

    expect(screen.getByTestId("detail-value")).toBeVisible();
    expect(screen.getByTestId("detail-value")).toHaveTextContent("2,000");
    userEvent.click(screen.getByText("Display"));
    userEvent.click(screen.getByLabelText("Show total"));

    await waitFor(() => {
      expect(screen.getByTestId("detail-value")).not.toBeVisible();
    });

    userEvent.click(screen.getByLabelText("Show total"));

    await waitFor(() => {
      expect(screen.getByTestId("detail-value")).toBeVisible();
    });

    jest.restoreAllMocks();
  });

  it("should allow you to show and hide the legend", async () => {
    setup();
    expect(screen.getByTestId("chart-legend")).toBeVisible();
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("2016");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("2017");
    userEvent.click(screen.getByText("Display"));
    userEvent.click(screen.getByLabelText("Show legend"));

    await waitFor(() => {
      expect(screen.queryByTestId("chart-legend")).not.toBeInTheDocument();
    });

    userEvent.click(screen.getByLabelText("Show legend"));

    await waitFor(() => {
      expect(screen.getByTestId("chart-legend")).toBeVisible();
    });
  });

  it("should allow you to disable showing percentages", async () => {
    setup();
    expect(screen.getByTestId("chart-legend")).toBeVisible();
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("25%");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("75%");
    userEvent.click(screen.getByText("Display"));
    userEvent.click(screen.getByLabelText("Off"));

    await waitFor(() => {
      expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("25%");
    });
    expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("75%");
  });

  it("should allow you to show percentages in the chart", async () => {
    setup();
    expect(screen.getByTestId("chart-legend")).toBeVisible();
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("25%");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("75%");
    expect(screen.getByTestId("pie-chart")).not.toHaveTextContent("25%");
    expect(screen.getByTestId("pie-chart")).not.toHaveTextContent("75%");

    userEvent.click(screen.getByText("Display"));
    userEvent.click(screen.getByLabelText("On the chart"));

    await waitFor(() => {
      expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("25%");
    });
    expect(screen.getByTestId("chart-legend")).toBeVisible();
    expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("75%");
    expect(screen.getByTestId("pie-chart")).toHaveTextContent("25%");
    expect(screen.getByTestId("pie-chart")).toHaveTextContent("75%");
  });
});
