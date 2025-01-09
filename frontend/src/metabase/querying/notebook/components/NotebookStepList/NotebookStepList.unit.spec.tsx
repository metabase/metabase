/* eslint jest/expect-expect: ["error", { "assertFunctionNames": ["assertActionButtonsOrder"] }] */
import type { ComponentProps } from "react";

import { createMockMetadata } from "__support__/metadata";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import type * as Lib from "metabase-lib";
import { createQuery, createQueryWithClauses } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import {
  createMockQueryBuilderState,
  createMockState,
} from "metabase-types/store/mocks";

import { NotebookProvider } from "../Notebook/context";

import { NotebookStepList } from "./NotebookStepList";

const metadata = createMockMetadata({
  databases: [createSampleDatabase()],
});

type SetupOpts = Partial<ComponentProps<typeof NotebookStepList>>;

function setup(opts: SetupOpts = {}, query: Lib.Query = createQuery()) {
  const database = createSampleDatabase();
  const reportTimezone = "UTC";
  const question = new Question(createMockCard(), metadata).setQuery(query);

  const state = createMockState({
    qb: createMockQueryBuilderState({
      card: question.card(),
    }),
    entities: createMockEntitiesState({
      databases: [database],
    }),
  });

  renderWithProviders(
    <NotebookProvider>
      <NotebookStepList
        question={question}
        reportTimezone={reportTimezone}
        updateQuestion={jest.fn()}
        {...opts}
      />
    </NotebookProvider>,
    {
      storeInitialState: state,
    },
  );
}

describe("NotebookStepList", () => {
  it("renders a list of actions for Summarize step with no breakouts", () => {
    const query = createQueryWithClauses({
      aggregations: [{ operatorName: "count" }],
    });
    setup({}, query);

    assertActionButtonsOrder(["Join data", "Custom column"]);
  });
});

function assertActionButtonsOrder(buttonNames: string[]) {
  const actionButtonsContainer = screen
    .getAllByTestId("action-buttons")
    .at(-1) as HTMLElement;
  const buttons = actionButtonsContainer.querySelectorAll("button");

  expect(buttons.length).toBe(buttonNames.length);
  buttonNames.forEach((name, index) => {
    expect(buttons[index]).toHaveAccessibleName(name);
  });
}
