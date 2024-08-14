import userEvent from "@testing-library/user-event";
import { thaw } from "icepick";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { render, screen } from "__support__/ui";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import { createMockColumn } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PRODUCTS,
  SAMPLE_DB_ID,
  createOrdersCreatedAtDatasetColumn,
  createProductsCategoryDatasetColumn,
  createSampleDatabase,
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
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS_ID,
              aggregation: ["count"],
              breakout: [
                ["field", ORDERS.CREATED_AT, { "temporal-unit": "year" }],

                [
                  "field",
                  PRODUCTS.CREATED_AT,
                  { "source-field": ORDERS.PRODUCT_ID },
                ],
              ],
            },
            database: SAMPLE_DB_ID,
          },
          display: "pivot",
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
              rows: [],
              cols: [
                createOrdersCreatedAtDatasetColumn({ source: "breakout" }),
                createProductsCategoryDatasetColumn({ source: "breakout" }),
                createMockColumn({
                  name: "count",
                  display_name: "Count",
                  field_ref: ["aggregation", "0"],
                  source: "aggregation",
                  base_type: "type/Integer",
                  effective_type: "type/Integer",
                }),
                createMockColumn({
                  name: "pivot-grouping",
                  display_name: "pivot-grouping",
                  expression_name: "pivot-grouping",
                  field_ref: ["expression", "pivot-grouping"],
                  source: "breakout",
                  base_type: "type/Integer",
                  effective_type: "type/Integer",
                }),
              ],
            },
          },
        ]}
        initial={{ section: "Data" }}
        noPreview
        question={question}
      />
    );
  };

  render(<Container />);
};

describe("table settings", () => {
  it("should allow you to update a column name", async () => {
    setup();
    await userEvent.click(
      await screen.findByTestId("Category-settings-button"),
    );
    await userEvent.type(
      await screen.findByDisplayValue("Category"),
      " Updated",
    );
    await userEvent.click(await screen.findByText("Count"));
    expect(await screen.findByText("Category Updated")).toBeInTheDocument();
  });
});
