import React from "react";
import { screen } from "@testing-library/react";

import SavedQuestionLoader from "metabase/containers/SavedQuestionLoader";
import { renderWithProviders } from "__support__/ui";
import {
  setupCardEndpoints,
  setupSchemaEndpoints,
  setupUnauthorizedSchemaEndpoints,
  setupUnauthorizedCardEndpoints,
} from "__support__/server-mocks";
import {
  createMockCard,
  createMockColumn,
  createMockDatabase,
} from "metabase-types/api/mocks";
import Question from "metabase-lib/Question";

const databaseMock = createMockDatabase({ id: 1 });

const childrenRenderFn = ({ loading, question, error }) => {
  if (error) {
    return <div>error</div>;
  }

  if (loading) {
    return <div>loading</div>;
  }

  return <div>{question.displayName()}</div>;
};

const setupQuestion = ({ id, name, hasAccess }) => {
  const card = createMockCard({
    id,
    name,
    result_metadata: [createMockColumn()],
  });
  const q = new Question(card, null);

  if (hasAccess) {
    setupCardEndpoints(q.card());
  } else {
    setupUnauthorizedCardEndpoints(q.card());
  }

  return card;
};

const setup = ({ questionId, hasAccess }) => {
  if (hasAccess) {
    setupSchemaEndpoints(databaseMock);
  } else {
    setupUnauthorizedSchemaEndpoints(databaseMock);
  }

  const card = setupQuestion({
    id: questionId,
    name: "Question 1",
    hasAccess,
  });

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
    setup({ questionId: 1, hasAccess: true });

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("Question 1")).toBeInTheDocument();
  });

  it("should handle errors", async () => {
    setup({ questionId: 1, hasAccess: false });

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(await screen.findByText("error")).toBeInTheDocument();
  });

  it("should load a new question if the question ID changes", async () => {
    const nextQuestionId = 2;
    setupQuestion({
      id: nextQuestionId,
      name: "Question 2",
      hasAccess: true,
    });

    const { rerender } = setup({ questionId: 1, hasAccess: true });

    expect(await screen.findByText("Question 1")).toBeInTheDocument();

    rerender(
      <SavedQuestionLoader questionId={nextQuestionId}>
        {childrenRenderFn}
      </SavedQuestionLoader>,
    );

    expect(screen.getByText("loading")).toBeInTheDocument();

    expect(await screen.findByText("Question 2")).toBeInTheDocument();
  });
});
