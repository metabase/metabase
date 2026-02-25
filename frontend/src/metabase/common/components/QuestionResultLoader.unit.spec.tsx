import { setupCardQueryEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import Question from "metabase-lib/v1/Question";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import type { QuestionResultLoaderChildState } from "./QuestionResultLoader";
import { QuestionResultLoader } from "./QuestionResultLoader";

describe("QuestionResultLoader", () => {
  it("should load a result given a question", async () => {
    const card = createMockCard({ id: 1 });
    const question = new Question(card);
    const dataset = createMockDataset();
    setupCardQueryEndpoints(question.card(), dataset);

    const childrenFn = jest.fn(
      ({ loading, result }: QuestionResultLoaderChildState) => (
        <div data-testid="content">
          {loading ? "loading" : result ? "loaded" : "no result"}
        </div>
      ),
    );

    renderWithProviders(
      <QuestionResultLoader question={question}>
        {childrenFn}
      </QuestionResultLoader>,
    );

    // Initial render should show loading
    expect(screen.getByTestId("content")).toHaveTextContent("loading");

    // Wait for the result to load
    await waitFor(() => {
      expect(screen.getByTestId("content")).toHaveTextContent("loaded");
    });

    // Verify children was called with correct state
    expect(childrenFn).toHaveBeenCalledWith(
      expect.objectContaining({
        loading: false,
        result: expect.objectContaining({ data: dataset.data }),
      }),
    );
  });
});
