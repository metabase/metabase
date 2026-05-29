import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { screen } from "__support__/ui";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { SdkQuestionId } from "embedding-sdk-bundle/types";
import { createMockColumn } from "metabase-types/api/mocks";

import { useQuestionQuery } from "./use-question-query";

const TEST_QUESTION_ID = 12;
const TEST_COLUMN = createMockColumn({
  display_name: "Count",
  name: "count",
});
const TEST_RESULT = {
  id: TEST_QUESTION_ID,
  name: "Orders",
  description: null,
  entityId: "test-entity-id",
  rowCount: 1,
  runningTime: 1000,
  columns: [TEST_COLUMN],
  rows: [[1]],
};

describe("useQuestionQuery", () => {
  it("fetches question data when the SDK is initialized", async () => {
    const queryQuestion = jest.fn(() =>
      jest.fn().mockResolvedValue({
        ...TEST_RESULT,
      }),
    );

    setup({ queryQuestion });

    await waitFor(() => {
      expect(screen.getByTestId("question-name")).toHaveTextContent("Orders");
    });

    expect(screen.getByTestId("first-row-value")).toHaveTextContent("1");
    expect(queryQuestion).toHaveBeenCalledTimes(1);
  });

  it("does not fetch when disabled", async () => {
    const queryQuestion = jest.fn(() => jest.fn());

    setup({ queryQuestion, enabled: false });

    expect(screen.getByTestId("question-name")).toHaveTextContent("");
    expect(queryQuestion).not.toHaveBeenCalled();
  });

  it("can refetch the question data", async () => {
    const queryQuestionApi = jest
      .fn()
      .mockResolvedValueOnce({
        ...TEST_RESULT,
      })
      .mockResolvedValueOnce({
        ...TEST_RESULT,
        name: "Orders updated",
      });
    const queryQuestion = jest.fn(() => queryQuestionApi);

    setup({ queryQuestion });

    await waitFor(() => {
      expect(screen.getByTestId("question-name")).toHaveTextContent("Orders");
    });

    await userEvent.click(screen.getByText("Refetch"));

    await waitFor(() => {
      expect(screen.getByTestId("question-name")).toHaveTextContent(
        "Orders updated",
      );
    });
    expect(queryQuestionApi).toHaveBeenCalledTimes(2);
  });
});

const TestComponent = ({
  questionId = TEST_QUESTION_ID,
  enabled,
}: {
  questionId?: SdkQuestionId | null;
  enabled?: boolean;
}) => {
  const result = useQuestionQuery(questionId, { enabled });

  return (
    <div>
      <div data-testid="question-name">{result.data?.name}</div>
      <div data-testid="first-row-value">
        {String(result.data?.rows[0]?.[0] ?? "")}
      </div>
      <button onClick={() => result.refetch()}>Refetch</button>
    </div>
  );
};

function setup({
  queryQuestion,
  enabled,
}: {
  queryQuestion: jest.Mock;
  enabled?: boolean;
}) {
  const { state } = setupSdkState();

  renderWithSDKProviders(<TestComponent enabled={enabled} />, {
    metabaseEmbeddingSdkBundleExports: {
      getLoginStatus,
      queryQuestion,
    },
    storeInitialState: state,
    componentProviderProps: {
      authConfig: createMockSdkConfig(),
    },
  });
}
