import userEvent from "@testing-library/user-event";
import { thaw } from "icepick";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  createOrdersCreatedAtDatasetColumn,
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

const setup = () => {
  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        {
          display: "pie",
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS_ID,
              aggregation: [["count"]],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],
              ],
            },
          },
          database: SAMPLE_DB_ID,
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
              cols: [
                createOrdersCreatedAtDatasetColumn({
                  field_ref: [
                    "field",
                    ORDERS.CREATED_AT,
                    { "temporal-unit": "year" },
                  ],
                  unit: "year",
                  source: "breakout",
                }),
                createMockColumn({
                  name: "count",
                  display_name: "Count",
                  field_ref: ["aggregation", "0"],
                  source: "aggregation",
                  base_type: "type/Integer",
                  effective_type: "type/Integer",
                }),
              ],
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

describe("PieChart", () => {
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

  it("should not have negative dimensions (metabase#28677)", () => {
    setup();

    const pieChart = screen.getByTestId("pie-chart");
    const width = pieChart.getAttribute("width");
    const height = pieChart.getAttribute("height");

    expect(parseFloat(width)).toBeGreaterThanOrEqual(0);
    expect(parseFloat(height)).toBeGreaterThanOrEqual(0);
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
    await userEvent.click(screen.getByText("Display"));
    await userEvent.click(screen.getByLabelText("Show total"));

    await waitFor(() => {
      expect(screen.queryByTestId("detail-value")).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText("Show total"));

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
    await userEvent.click(screen.getByText("Display"));
    await userEvent.click(screen.getByLabelText("Show legend"));

    await waitFor(() => {
      expect(screen.queryByTestId("chart-legend")).not.toBeInTheDocument();
    });

    await userEvent.click(screen.getByLabelText("Show legend"));

    await waitFor(() => {
      expect(screen.getByTestId("chart-legend")).toBeVisible();
    });
  });

  it("should allow you to disable showing percentages", async () => {
    setup();
    expect(screen.getByTestId("chart-legend")).toBeVisible();
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("25%");
    expect(screen.getByTestId("chart-legend")).toHaveTextContent("75%");
    await userEvent.click(screen.getByText("Display"));
    await userEvent.click(screen.getByLabelText("Off"));

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

    await userEvent.click(screen.getByText("Display"));
    await userEvent.click(screen.getByLabelText("On the chart"));

    await waitFor(() => {
      expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("25%");
    });
    expect(screen.getByTestId("chart-legend")).toBeVisible();
    expect(screen.getByTestId("chart-legend")).not.toHaveTextContent("75%");
    expect(screen.getByTestId("pie-chart")).toHaveTextContent("25%");
    expect(screen.getByTestId("pie-chart")).toHaveTextContent("75%");
  });
});
