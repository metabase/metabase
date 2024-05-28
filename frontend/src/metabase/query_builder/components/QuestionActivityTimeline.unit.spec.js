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
import { createMockUser, createMockUserInfo } from "metabase-types/api/mocks";
import { createMockRevision } from "metabase-types/api/mocks/revision";

const REVISIONS = [
  {
    is_reversion: true,
    description: "bar",
    timestamp: "2016-05-08T02:02:07.441Z",
    user: {
      common_name: "Bar",
    },
  },
  {
    is_creation: true,
    description: "foo",
    timestamp: "2016-04-08T02:02:07.441Z",
    user: {
      common_name: "Foo",
    },
  },
];

async function setup({ question }) {
  setupRevisionsEndpoints([
    createMockRevision(),
    createMockRevision({ id: 2 }),
  ]);
  setupUsersEndpoints([createMockUserInfo()]);
  renderWithProviders(
    <QuestionActivityTimeline
      question={question}
      revisions={REVISIONS}
      currentUser={createMockUser()}
    />,
  );
  await waitForLoaderToBeRemoved();
}

describe("QuestionActivityTimeline", () => {
  describe("when the user does not have perms to modify the question", () => {
    const question = {
      canWrite: () => false,
      getModerationReviews: () => [],
      id: () => 1,
    };

    it("should not render revert action buttons", async () => {
      await setup({ question });
      expect(() => screen.getByTestId("question-revert-button")).toThrow();
    });
  });

  describe("when the user does have perms to modify the question", () => {
    const question = {
      canWrite: () => true,
      getModerationReviews: () => [],
      id: () => 1,
    };

    it("should render revert action buttons", async () => {
      await setup({ question });
      expect(screen.getByTestId("question-revert-button")).toBeInTheDocument();
    });
  });
});
