import { useState } from "react";
import { thaw } from "icepick";
import userEvent from "@testing-library/user-event";
import { createMockMetadata } from "__support__/metadata";
import { render, screen } from "__support__/ui";
import {
  createSampleDatabase,
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import Question from "metabase-lib/Question";

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

                ["field", PEOPLE.SOURCE, { "source-field": ORDERS.USER_ID }],
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
              // Need to add missing sources so that the setting displays
              cols: [
                ...question
                  .query()
                  .columns()
                  .map(c => ({ ...c, source: c.source || "breakout" })),
                {
                  base_type: "type/Integer",
                  name: "pivot-grouping",
                  display_name: "pivot-grouping",
                  expression_name: "pivot-grouping",
                  field_ref: ["expression", "pivot-grouping"],
                  source: "breakout",
                  effective_type: "type/Integer",
                },
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
    userEvent.click(await screen.findByTestId("Source-settings-button"));
    userEvent.type(await screen.findByDisplayValue("Source"), " Updated");
    userEvent.click(await screen.findByText("Count"));
    expect(await screen.findByText("Source Updated")).toBeInTheDocument();
  });
});
