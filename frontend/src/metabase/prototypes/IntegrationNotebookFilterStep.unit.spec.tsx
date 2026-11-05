import userEvent from "@testing-library/user-event";

import { createMockMetadata } from "__support__/metadata";
import {
  setupDatabaseEndpoints,
  setupPrototypeSamplesEndpoint,
} from "__support__/server-mocks";
import {
  createMockQueryBuilderState,
  createMockState,
} from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { NotebookProvider } from "metabase/querying/notebook/components/Notebook/context";
import { NotebookStepList } from "metabase/querying/notebook/components/NotebookStepList/NotebookStepList";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import { createMockCard } from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { IntegrationNotebookFilterStep } from "./IntegrationNotebookFilterStep";
import { withOrExample } from "./or-filters/harness/examples";

it("uses the OR editor in the notebook and commits edits without Apply", async () => {
  const database = createSampleDatabase();
  setupDatabaseEndpoints(database);
  setupPrototypeSamplesEndpoint();
  const query = withOrExample(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
    0,
  );
  const question = new Question(
    createMockCard(),
    createMockMetadata({ databases: [database] }),
  ).setQuery(query);
  const updateQuestion = jest.fn();
  renderWithProviders(
    <NotebookProvider filterStepComponent={IntegrationNotebookFilterStep}>
      <NotebookStepList
        question={question}
        reportTimezone="UTC"
        updateQuestion={updateQuestion}
      />
    </NotebookProvider>,
    {
      storeInitialState: createMockState({
        qb: createMockQueryBuilderState({ card: question.card() }),
        entities: createMockEntitiesState({ databases: [database] }),
      }),
    },
  );
  await userEvent.click(screen.getByText("or"));
  await waitFor(() => expect(updateQuestion).toHaveBeenCalled());
  const nextQuestion: Question = updateQuestion.mock.calls.at(-1)[0];
  expect(Lib.filters(nextQuestion.query(), 0)).toHaveLength(2);
  expect(
    screen.queryByRole("button", { name: "Apply" }),
  ).not.toBeInTheDocument();
});
