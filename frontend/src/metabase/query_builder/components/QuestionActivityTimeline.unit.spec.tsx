import {
  setupRevisionsEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import { createMockRevision } from "metabase-types/api/mocks/revision";

interface SetupOpts {
  canWrite: boolean;
}

async function setup({ canWrite }: SetupOpts) {
  const question = new Question(createMockCard({ can_write: canWrite }));

  setupRevisionsEndpoints([
    createMockRevision(),
    createMockRevision({ id: 2 }),
  ]);
  setupUsersEndpoints([createMockUserListResult()]);
  renderWithProviders(<QuestionActivityTimeline question={question} />);
  await waitForLoaderToBeRemoved();
}

describe("QuestionActivityTimeline", () => {
  describe("when the user does not have perms to modify the question", () => {
    it("should not render revert action buttons", async () => {
      await setup({ canWrite: false });
      expect(() => screen.getByTestId("question-revert-button")).toThrow();
    });
  });

  describe("when the user does have perms to modify the question", () => {
    it("should render revert action buttons", async () => {
      await setup({ canWrite: true });
      expect(screen.getByTestId("question-revert-button")).toBeInTheDocument();
    });
  });
});
