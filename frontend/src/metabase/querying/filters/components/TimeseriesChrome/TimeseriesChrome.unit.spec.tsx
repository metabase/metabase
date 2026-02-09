import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import {
  SAMPLE_DATABASE,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
  createQuery,
  createTestQuery,
} from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { TimeseriesChrome } from "./TimeseriesChrome";

interface SetupOpts {
  query?: Lib.Query;
}

function setup({ query = createQuery() }: SetupOpts = {}) {
  const question = new Question(createMockCard(), SAMPLE_METADATA).setQuery(
    query,
  );
  const stageIndex = -1;
  const updateQuestion = jest.fn();

  const getNextBreakouts = () => {
    const nextQuestion = updateQuestion.mock.calls[0][0];
    const nextQuery = nextQuestion.query();
    return Lib.breakouts(nextQuery, stageIndex).map((breakout) =>
      Lib.displayInfo(nextQuery, stageIndex, breakout),
    );
  };

  renderWithProviders(
    <TimeseriesChrome question={question} updateQuestion={updateQuestion} />,
  );

  return { getNextBreakouts };
}

describe("TimeseriesChrome", () => {
  it("should not render the chrome if there are no breakouts", () => {
    setup();
    expect(screen.queryByText("View")).not.toBeInTheDocument();
  });

  it("should not render the chrome if there are no breakouts on a temporal column", () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          breakouts: [{ name: "CATEGORY" }],
        },
      ],
    });
    setup({ query });
    expect(screen.queryByText("View")).not.toBeInTheDocument();
  });

  it("should allow to change the temporal unit for a breakout", async () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          breakouts: [{ name: "CREATED_AT", unit: "month" }],
        },
      ],
    });
    const { getNextBreakouts } = setup({ query });

    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(await screen.findByText("Year"));

    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Created At: Year" },
    ]);
  });

  it("should allow to change the temporal unit for a breakout when there are multiple breakouts of the same column", async () => {
    const query = createTestQuery(SAMPLE_PROVIDER, {
      databaseId: SAMPLE_DATABASE.id,
      stages: [
        {
          source: {
            type: "table",
            id: ORDERS_ID,
          },
          breakouts: [
            { name: "CREATED_AT", unit: "month" },
            { name: "CREATED_AT", unit: "year" },
          ],
        },
      ],
    });
    const { getNextBreakouts } = setup({ query });

    await userEvent.click(screen.getByText("Month"));
    await userEvent.click(await screen.findByText("Quarter"));

    expect(getNextBreakouts()).toMatchObject([
      { displayName: "Created At: Quarter" },
      { displayName: "Created At: Year" },
    ]);
  });
});
