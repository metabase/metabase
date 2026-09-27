import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  useRankQueryStepsMutation,
  useSuggestJoinEdgesMutation,
} from "metabase/api/jev";
import * as Lib from "metabase-lib";
import {
  DEFAULT_TEST_QUERY,
  SAMPLE_METADATA,
  SAMPLE_PROVIDER,
} from "metabase-lib/query/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";

import { QueryNextSteps } from "./QueryNextSteps";

jest.mock("metabase/api/jev", () => ({
  ...jest.requireActual("metabase/api/jev"),
  useRankQueryStepsMutation: jest.fn(),
  useSuggestJoinEdgesMutation: jest.fn(),
}));

describe("query next steps", () => {
  it("only changes the query after explicit preview and apply", async () => {
    const query = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY);
    const question = new Question(
      createMockCard({ dataset_query: Lib.toLegacyQuery(query) }),
      SAMPLE_METADATA,
    );
    const updateQuestion = jest.fn().mockResolvedValue(undefined);
    const rank = jest.fn().mockReturnValue({
      unwrap: async () => ({
        answers: { next: { probabilities: { step_0: 0.9, none: 0.1 } } },
      }),
    });
    const joins = jest.fn().mockReturnValue({
      unwrap: async () => ({
        suggestions: [],
        tables_considered: 12,
        status: "ok",
      }),
    });
    // The module factory above replaces these hooks with jest.fn mocks.
    (useRankQueryStepsMutation as jest.Mock).mockReturnValue([rank]);
    // The module factory above replaces these hooks with jest.fn mocks.
    (useSuggestJoinEdgesMutation as jest.Mock).mockReturnValue([joins]);
    renderWithProviders(
      <QueryNextSteps question={question} updateQuestion={updateQuestion} />,
    );
    expect(rank).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Find next steps" }),
    );
    const previews = await screen.findAllByRole("button", { name: "Preview" });
    expect(updateQuestion).not.toHaveBeenCalled();
    await userEvent.click(previews[0]);
    const apply = await screen.findByRole("button", { name: "Apply change" });
    expect(updateQuestion).not.toHaveBeenCalled();
    await userEvent.click(apply);
    await waitFor(() => expect(updateQuestion).toHaveBeenCalledTimes(1));
    expect(
      Lib.aggregations(updateQuestion.mock.calls[0][0].query(), -1),
    ).toHaveLength(1);
    expect(Lib.aggregations(question.query(), -1)).toHaveLength(0);
  });
});
