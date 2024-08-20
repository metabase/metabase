import userEvent from "@testing-library/user-event";
import { thaw } from "icepick";
import { useState } from "react";

import { createMockMetadata } from "__support__/metadata";
import { renderWithProviders, screen, within } from "__support__/ui";
import ChartSettings from "metabase/visualizations/components/ChartSettings";
import registerVisualizations from "metabase/visualizations/register";
import Question from "metabase-lib/v1/Question";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

registerVisualizations();

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});
const ordersTable = metadata.table(ORDERS_ID);

const setup = ({ vizType }) => {
  const Container = () => {
    const [question, setQuestion] = useState(
      new Question(
        {
          dataset_query: {
            type: "query",
            query: {
              "source-table": ORDERS_ID,
            },
            database: SAMPLE_DB_ID,
          },
          display: vizType,
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
              cols: ordersTable.fields.map(f => f.column()),
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
      await userEvent.click(screen.getByText("Add or remove columns"));

      expect(screen.getByText("User")).toBeInTheDocument();
      expect(screen.getByText("Product")).toBeInTheDocument();

      const userColumList = screen.getByTestId("user-table-columns");

      expect(within(userColumList).getByLabelText("Address")).not.toBeChecked();
      expect(within(userColumList).getByLabelText("State")).not.toBeChecked();
    });

    it("should allow you to show and hide columns", async () => {
      setup({ vizType });
      await userEvent.click(await screen.findByTestId("Tax-hide-button"));

      expect(
        await screen.findByRole("listitem", { name: "Tax" }),
      ).toHaveAttribute("data-enabled", "false");

      await userEvent.click(await screen.findByTestId("Tax-show-button"));
      //If we can see the hide button, then we know it's been added back in.
      expect(await screen.findByTestId("Tax-hide-button")).toBeInTheDocument();
    });

    it("should allow you to update a column name", async () => {
      setup({ vizType });
      await userEvent.click(
        await screen.findByTestId("Subtotal-settings-button"),
      );
      await userEvent.type(
        await screen.findByDisplayValue("Subtotal"),
        " Updated",
      );
      await userEvent.click(await screen.findByText("Tax"));
      expect(await screen.findByText("Subtotal Updated")).toBeInTheDocument();
    });
  });
});
