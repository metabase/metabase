import { setupMetricsEndpoints } from "__support__/server-mocks/metric";
import { renderWithProviders, waitFor } from "__support__/ui";
import type { MetricOrMeasure } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { createMockMetric } from "metabase-types/api/mocks/metric";

import { NewExplorationChat } from "./NewExplorationChat";

jest.mock("metabase/metabot/components/MetabotChat/MetabotChatEditor", () => ({
  MetabotChatEditor: () => null,
}));

jest.mock("metabase/metabot/components/MetabotChat/MetabotChatMessage", () => ({
  Messages: () => null,
}));

jest.mock("metabase/metabot/components/MetabotChat/MetabotThinking", () => ({
  MetabotThinking: () => null,
}));

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
}));

const metricRevenue = createMockMetric({
  id: 1,
  name: "Monthly recurring revenue",
  description: "Revenue per month",
});
const metricChurn = createMockMetric({
  id: 2,
  name: "Churn rate",
  description: "Customers lost",
});

const userMessage: MetabotChatMessage = {
  id: "user-1",
  role: "user",
  type: "text",
  message: "Why is revenue down?",
};

const searchToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-1",
  role: "agent",
  type: "tool_call",
  name: "search",
  status: "ended",
  result: "<search-results></search-results>",
};

const metricIdsToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-2",
  role: "agent",
  type: "tool_call",
  name: "select_exploration_metrics",
  status: "ended",
  result: JSON.stringify({ metric_ids: [metricRevenue.id, metricChurn.id] }),
};

const agentMessage: MetabotChatMessage = {
  id: "agent-1",
  role: "agent",
  type: "text",
  message: "I selected these metrics because they are related to revenue.",
};

function mockMetabotAgentState({
  messages,
  isDoingScience,
}: {
  messages: MetabotChatMessage[];
  isDoingScience: boolean;
}) {
  jest.mocked(useMetabotAgent).mockReturnValue({
    prompt: "",
    setPrompt: jest.fn(),
    messages,
    errorMessages: [],
    retryMessage: jest.fn(),
    isDoingScience,
    activeToolCalls: [],
    submitInput: jest.fn(),
  } as any);
}

function setup() {
  setupMetricsEndpoints([metricRevenue, metricChurn]);

  const setMetrics = jest.fn();

  mockMetabotAgentState({
    messages: [userMessage],
    isDoingScience: true,
  });

  const view = renderWithProviders(
    <NewExplorationChat metrics={[]} setMetrics={setMetrics} />,
  );

  const rerender = ({
    messages,
    isDoingScience,
  }: {
    messages: MetabotChatMessage[];
    isDoingScience: boolean;
  }) => {
    mockMetabotAgentState({ messages, isDoingScience });
    view.rerender(<NewExplorationChat metrics={[]} setMetrics={setMetrics} />);
  };

  return { setMetrics, rerender };
}

describe("NewExplorationChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds metrics from a metric_ids tool call response", async () => {
    const { setMetrics, rerender } = setup();

    rerender({
      messages: [userMessage, searchToolCallMessage],
      isDoingScience: true,
    });
    rerender({
      messages: [userMessage, searchToolCallMessage, metricIdsToolCallMessage],
      isDoingScience: true,
    });

    expect(setMetrics).not.toHaveBeenCalled();

    rerender({
      messages: [
        userMessage,
        searchToolCallMessage,
        metricIdsToolCallMessage,
        agentMessage,
      ],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(setMetrics).toHaveBeenCalledWith(expect.any(Function));
    });

    const updateMetrics = setMetrics.mock.calls[0][0] as (
      metrics: MetricOrMeasure[],
    ) => MetricOrMeasure[];

    expect(updateMetrics([])).toEqual([
      expect.objectContaining({
        type: "metric",
        id: metricRevenue.id,
        name: metricRevenue.name,
      }),
      expect.objectContaining({
        type: "metric",
        id: metricChurn.id,
        name: metricChurn.name,
      }),
    ]);
  });
});
