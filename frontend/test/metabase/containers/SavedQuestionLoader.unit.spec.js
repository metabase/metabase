import React from "react";
import { screen, waitFor } from "@testing-library/react";

import SavedQuestionLoader from "metabase/containers/SavedQuestionLoader";
import { renderWithProviders } from "__support__/ui";
import { setupCardEndpoints } from "__support__/server-mocks";
import { createMockCard, createMockColumn } from "metabase-types/api/mocks";
import { loadMetadataForCard } from "metabase/questions/actions";
import Question from "metabase-lib/Question";

jest.mock("metabase/questions/actions", () => ({
  loadMetadataForCard: jest.fn(() => Promise.resolve(1)),
}));

const childrenRenderFn = ({ loading, question, error }) => {
  if (error) {
    return <div>error</div>;
  }

  if (loading) {
    return <div>loading</div>;
  }

  return <div>{question.displayName()}</div>;
};

const setupQuestion = ({ id, name }) => {
  const card = createMockCard({
    id,
    name,
    result_metadata: [createMockColumn()],
  });
  const q = new Question(card, null);

  setupCardEndpoints(q.card());

  return card;
};

const setup = ({ questionId }) => {
  const card = setupQuestion({ id: questionId, name: "Question 1" });

  const { rerender } = renderWithProviders(
    <SavedQuestionLoader questionId={questionId}>
      {childrenRenderFn}
    </SavedQuestionLoader>,
  );

  return { rerender, card };
};

describe("SavedQuestionLoader", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it("should load a question given a questionId", async () => {
    const { card } = setup({ questionId: 1 });

    expect(screen.getByText("loading")).toBeInTheDocument();

    await waitFor(async () => {
      expect(loadMetadataForCard).toHaveBeenCalledWith(card);
    });

    expect(await screen.findByText("Question 1")).toBeInTheDocument();
  });

  it("should handle errors", async () => {
    loadMetadataForCard.mockImplementation(() => Promise.reject("error"));
    const { card } = setup({ questionId: 1 });

    expect(screen.getByText("loading")).toBeInTheDocument();

    await waitFor(async () => {
      expect(loadMetadataForCard).toHaveBeenCalledWith(card);
    });

    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("should load a new question if the question ID changes", async () => {
    const nextQuestionId = 2;
    const nextCard = setupQuestion({ id: nextQuestionId, name: "Question 2" });

    const { rerender } = setup({ questionId: 1 });

    expect(await screen.findByText("Question 1")).toBeInTheDocument();

    rerender(
      <SavedQuestionLoader questionId={nextQuestionId}>
        {childrenRenderFn}
      </SavedQuestionLoader>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();

    await waitFor(async () => {
      expect(loadMetadataForCard).toHaveBeenCalledWith(nextCard);
    });

    expect(await screen.findByText("Question 2")).toBeInTheDocument();
  });
});
