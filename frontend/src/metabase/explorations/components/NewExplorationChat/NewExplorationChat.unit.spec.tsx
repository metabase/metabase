import { renderWithProviders, waitFor } from "__support__/ui";
import type { ExplorationMetric } from "metabase/explorations/types";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import type {
  GetExplorationDataResponse,
  MetricDimension,
} from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

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

const revenueDateDimension = createMockMetricDimension({
  id: "revenue.created_at",
  name: "created_at",
  display_name: "Created At",
  effective_type: "type/DateTime",
  semantic_type: "type/CreationTimestamp",
});
const customerSegmentDimension = createMockMetricDimension({
  id: "customer.segment",
  name: "segment",
  display_name: "Customer Segment",
  semantic_type: "type/Category",
});

const metricRevenue: GetExplorationDataResponse["metrics"][number] = {
  ...createMockMetric({
    id: 1,
    name: "Monthly recurring revenue",
    description: "Revenue per month",
  }),
  dimension_ids: [revenueDateDimension.id],
  dimensions: [revenueDateDimension],
};
const metricChurn: GetExplorationDataResponse["metrics"][number] = {
  ...createMockMetric({
    id: 2,
    name: "Churn rate",
    description: "Customers lost",
  }),
  dimension_ids: [customerSegmentDimension.id],
  dimensions: [customerSegmentDimension],
};

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

const explorationDataResponse: GetExplorationDataResponse = {
  metrics: [metricRevenue, metricChurn],
  dimension_groups: [
    {
      name: "Created At",
      dimension_interestingness: null,
      dimensions: [revenueDateDimension],
    },
    {
      name: "Customer Segment",
      dimension_interestingness: null,
      dimensions: [customerSegmentDimension],
    },
  ],
};

const explorationDataToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-2",
  role: "agent",
  type: "tool_call",
  name: "select_exploration_metrics",
  status: "ended",
  result: JSON.stringify(explorationDataResponse),
};

const setNameToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-3",
  role: "agent",
  type: "tool_call",
  name: "set_exploration_name",
  status: "ended",
  result: JSON.stringify({ name: "Revenue investigation" }),
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
    conversation: { messages },
    messages,
    errorMessages: [],
    retryMessage: jest.fn(),
    isDoingScience,
    activeToolCalls: [],
    submitInput: jest.fn(),
  } as any);
}

function setup() {
  const setMetrics = jest.fn();
  const setDimensions = jest.fn();
  const setName = jest.fn();

  mockMetabotAgentState({
    messages: [userMessage],
    isDoingScience: true,
  });

  const view = renderWithProviders(
    <NewExplorationChat
      setMetrics={setMetrics}
      setDimensions={setDimensions}
      setName={setName}
    />,
  );

  const rerender = ({
    messages,
    isDoingScience,
  }: {
    messages: MetabotChatMessage[];
    isDoingScience: boolean;
  }) => {
    mockMetabotAgentState({ messages, isDoingScience });
    view.rerender(
      <NewExplorationChat
        setMetrics={setMetrics}
        setDimensions={setDimensions}
        setName={setName}
      />,
    );
  };

  return { setMetrics, setDimensions, setName, rerender };
}

describe("NewExplorationChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds metrics and dimensions from an exploration data tool call response", async () => {
    const { setMetrics, setDimensions, rerender } = setup();

    rerender({
      messages: [userMessage, searchToolCallMessage],
      isDoingScience: true,
    });
    rerender({
      messages: [
        userMessage,
        searchToolCallMessage,
        explorationDataToolCallMessage,
      ],
      isDoingScience: true,
    });

    expect(setMetrics).not.toHaveBeenCalled();
    expect(setDimensions).not.toHaveBeenCalled();

    rerender({
      messages: [
        userMessage,
        searchToolCallMessage,
        explorationDataToolCallMessage,
        agentMessage,
      ],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(setMetrics).toHaveBeenCalledWith(expect.any(Function));
    });
    expect(setDimensions).toHaveBeenCalledWith(expect.any(Function));

    const updateMetrics = setMetrics.mock.calls[0][0] as (
      metrics: ExplorationMetric[],
    ) => ExplorationMetric[];
    const updateDimensions = setDimensions.mock.calls[0][0] as (
      dimensions: MetricDimension[],
    ) => MetricDimension[];

    expect(updateMetrics([])).toEqual([
      expect.objectContaining({
        id: metricRevenue.id,
        name: metricRevenue.name,
      }),
      expect.objectContaining({
        id: metricChurn.id,
        name: metricChurn.name,
      }),
    ]);
    expect(updateDimensions([])).toEqual([
      expect.objectContaining({
        id: revenueDateDimension.id,
        display_name: revenueDateDimension.display_name,
      }),
      expect.objectContaining({
        id: customerSegmentDimension.id,
        display_name: customerSegmentDimension.display_name,
      }),
    ]);
  });

  it("sets the exploration name from a set name tool call response", async () => {
    const { setName, rerender } = setup();

    rerender({
      messages: [userMessage, setNameToolCallMessage],
      isDoingScience: true,
    });

    expect(setName).not.toHaveBeenCalled();

    rerender({
      messages: [userMessage, setNameToolCallMessage, agentMessage],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(setName).toHaveBeenCalledWith(expect.any(Function));
    });

    const updateName = setName.mock.calls[0][0] as (
      name: string | null,
    ) => string | null;

    expect(updateName(null)).toBe("Revenue investigation");
    expect(updateName("Existing name")).toBe("Existing name");
  });
});
