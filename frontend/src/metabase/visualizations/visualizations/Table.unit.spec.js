import React, { useState } from "react";
import { thaw } from "icepick";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, within } from "__support__/ui";

import {
  SAMPLE_DATABASE,
  ORDERS,
  metadata,
} from "__support__/sample_database_fixture";
import ChartSettings from "metabase/visualizations/components/ChartSettings";

import Question from "metabase-lib/Question";

const setup = ({ vizType }) => {
  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        {
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS.id,
            },
            display: vizType,
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
              rows: [],
              cols: ORDERS.fields.map(f => f.column()),
            },
          },
        ]}
        initial={{ section: "Data" }}
        noPreview
        question={question}
      />
    );
  };

  renderWithProviders(<Container />);
};

// these visualizations share column settings, so all the tests should work for both
["table", "object"].forEach(vizType => {
  describe(`${vizType} column settings`, () => {
    it("should show you related columns in structured queries", async () => {
      setup({ vizType });
      expect(await screen.findByText("More columns")).toBeInTheDocument();
      expect(await screen.findByText("People")).toBeInTheDocument();
      expect(await screen.findByText("Products")).toBeInTheDocument();
    });

    it("should allow you to show and hide columns", async () => {
      setup({ vizType });
      userEvent.click(await screen.findByTestId("Tax-hide-button"));

      expect(
        await within(await screen.findByTestId("disabled-columns")).findByText(
          "Tax",
        ),
      ).toBeInTheDocument();

      userEvent.click(await screen.findByTestId("Tax-add-button"));
      //If we can see the hide button, then we know it's been added back in.
      expect(await screen.findByTestId("Tax-hide-button")).toBeInTheDocument();
    });

    it("should allow you to update a column name", async () => {
      setup({ vizType });
      userEvent.click(await screen.findByTestId("Subtotal-settings-button"));
      userEvent.type(await screen.findByDisplayValue("Subtotal"), " Updated");
      userEvent.click(await screen.findByText("Tax"));
      expect(await screen.findByText("Subtotal Updated")).toBeInTheDocument();
    });
  });
});
