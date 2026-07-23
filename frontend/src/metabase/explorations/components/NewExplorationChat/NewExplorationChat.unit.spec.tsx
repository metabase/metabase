import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, waitFor } from "__support__/ui";
import { trackExplorationPlanEdited } from "metabase/explorations/analytics";
import { makeMockSelection } from "metabase/explorations/test-utils";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  AddResearchGroupsResponse,
  GetExplorationDataResponse,
} from "metabase-types/api";
import {
  createMockMetric,
  createMockMetricDimension,
  createMockTokenFeatures,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";

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

jest.mock("metabase/explorations/analytics", () => ({
  trackExplorationAgentMessageSent: jest.fn(),
  trackExplorationPlanEdited: jest.fn(),
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
  dimension_interestingness: 0.85,
});
const customerSegmentDimension = createMockMetricDimension({
  id: "customer.segment",
  name: "segment",
  display_name: "Customer Segment",
  semantic_type: "type/Category",
  dimension_interestingness: 0.3,
});
const productCategoryDimension = createMockMetricDimension({
  id: "product.category",
  name: "category",
  display_name: "Product Category",
  semantic_type: "type/Category",
  dimension_interestingness: null,
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

const customerSegmentGroup = {
  name: "Customer Segment",
  dimension_interestingness: 0.3,
  dimensions: [customerSegmentDimension],
};

const addResearchGroupsResponse: AddResearchGroupsResponse = {
  metrics: [metricRevenue, metricChurn],
  dimension_groups: [
    {
      name: "Created At",
      dimension_interestingness: 0.85,
      dimensions: [revenueDateDimension],
    },
    customerSegmentGroup,
    {
      name: "Product Category",
      dimension_interestingness: null,
      dimensions: [productCategoryDimension],
    },
  ],
  groups: [
    // metric-anchored: Revenue with an explicitly-chosen dimension
    {
      anchor: "metric",
      metric_id: metricRevenue.id,
      dimension_ids: [revenueDateDimension.id],
    },
    // dimension-anchored: slice every related metric by Customer Segment
    { anchor: "dimension", dimension_id: customerSegmentDimension.id },
  ],
};

const addResearchGroupsToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-2",
  role: "agent",
  type: "tool_call",
  name: "add_research_groups",
  status: "ended",
  result: JSON.stringify(addResearchGroupsResponse),
};

const setNameToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-3",
  role: "agent",
  type: "tool_call",
  name: "set_research_name",
  status: "ended",
  result: JSON.stringify({ name: "Revenue investigation" }),
};

const removeFromResearchPlanToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-4",
  role: "agent",
  type: "tool_call",
  name: "remove_from_research_plan",
  status: "ended",
  result: JSON.stringify({
    block_ids: ["metric:1", "dim:customer.segment"],
  }),
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
  // Unjustified type cast. FIXME
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
  fetchMock.get(
    "path:/api/metabot/permissions/user-permissions",
    createMockUserMetabotPermissions(),
  );

  const settings = mockSettings({
    "llm-metabot-configured?": true,
    "metabot-enabled?": true,
    "token-features": createMockTokenFeatures({ ai_controls: true }),
  });
  setupEnterprisePlugins();

  const selection = makeMockSelection({});

  mockMetabotAgentState({
    messages: [userMessage],
    isDoingScience: true,
  });

  const view = renderWithProviders(
    <NewExplorationChat selection={selection} />,
    {
      storeInitialState: createMockState({ settings }),
    },
  );

  const rerender = ({
    messages,
    isDoingScience,
  }: {
    messages: MetabotChatMessage[];
    isDoingScience: boolean;
  }) => {
    mockMetabotAgentState({ messages, isDoingScience });
    view.rerender(<NewExplorationChat selection={selection} />);
  };

  return { selection, rerender };
}

describe("NewExplorationChat", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("adds metric- and dimension-anchored groups from an add_research_groups tool call response", async () => {
    const { selection, rerender } = setup();

    rerender({
      messages: [userMessage, searchToolCallMessage],
      isDoingScience: true,
    });
    rerender({
      messages: [
        userMessage,
        searchToolCallMessage,
        addResearchGroupsToolCallMessage,
      ],
      isDoingScience: true,
    });

    expect(selection.addMetric).not.toHaveBeenCalled();
    expect(selection.addDimension).not.toHaveBeenCalled();

    rerender({
      messages: [
        userMessage,
        searchToolCallMessage,
        addResearchGroupsToolCallMessage,
        agentMessage,
      ],
      isDoingScience: false,
    });

    // metric-anchored group -> addMetric, carrying the explicitly-chosen dimension ids
    await waitFor(() => {
      expect(selection.addMetric).toHaveBeenCalledTimes(1);
    });
    expect(selection.addMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        id: metricRevenue.id,
        name: metricRevenue.name,
      }),
      {
        dimensionsById: expect.any(Map),
        additionalSelectedDimensionIds: new Set([revenueDateDimension.id]),
      },
    );

    // The dimensionsById map should contain every dimension from the groups.
    const { dimensionsById } = jest.mocked(selection.addMetric).mock
      .calls[0][1];
    expect(dimensionsById.size).toBe(3);
    expect(dimensionsById.get(revenueDateDimension.id)).toEqual(
      revenueDateDimension,
    );

    // dimension-anchored group -> addDimension with the resolved dimension group
    expect(selection.addDimension).toHaveBeenCalledTimes(1);
    expect(selection.addDimension).toHaveBeenCalledWith(
      expect.objectContaining({ id: customerSegmentDimension.id }),
      {
        group: customerSegmentGroup,
        metricsByDimension: expect.any(Map),
      },
    );

    expect(trackExplorationPlanEdited).toHaveBeenCalledWith("agent", "metrics");
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
      "agent",
      "dimensions",
    );
  });

  it("forwards replace_default_dimensions and metric_ids to the selection mutators", async () => {
    const { selection, rerender } = setup();

    const message: MetabotDebugToolCallMessage = {
      ...addResearchGroupsToolCallMessage,
      id: "tool-call-replace",
      result: JSON.stringify({
        ...addResearchGroupsResponse,
        groups: [
          {
            anchor: "metric",
            metric_id: metricRevenue.id,
            dimension_ids: [revenueDateDimension.id],
            replace_default_dimensions: true,
          },
          {
            anchor: "dimension",
            dimension_id: customerSegmentDimension.id,
            metric_ids: [metricRevenue.id],
          },
        ],
      }),
    };

    rerender({ messages: [userMessage, message], isDoingScience: true });
    rerender({
      messages: [userMessage, message, agentMessage],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(selection.addMetric).toHaveBeenCalled();
    });
    // metric anchor forwards the replace flag
    expect(selection.addMetric).toHaveBeenCalledWith(
      expect.objectContaining({ id: metricRevenue.id }),
      expect.objectContaining({ replace: true }),
    );
    // dimension anchor forwards the curated metric subset
    expect(selection.addDimension).toHaveBeenCalledWith(
      expect.objectContaining({ id: customerSegmentDimension.id }),
      expect.objectContaining({
        selectedMetricIds: new Set([metricRevenue.id]),
      }),
    );
  });

  it("sets the exploration name from a set name tool call response", async () => {
    const { selection, rerender } = setup();

    rerender({
      messages: [userMessage, setNameToolCallMessage],
      isDoingScience: true,
    });

    expect(selection.setName).not.toHaveBeenCalled();

    rerender({
      messages: [userMessage, setNameToolCallMessage, agentMessage],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(selection.setName).toHaveBeenCalledWith("Revenue investigation");
    });
  });

  it("removes blocks from a remove_from_research_plan tool call response", async () => {
    const { selection, rerender } = setup();

    rerender({
      messages: [userMessage, removeFromResearchPlanToolCallMessage],
      isDoingScience: true,
    });

    // Not applied while the agent is still working.
    expect(selection.removeBlock).not.toHaveBeenCalled();

    rerender({
      messages: [
        userMessage,
        removeFromResearchPlanToolCallMessage,
        agentMessage,
      ],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(selection.removeBlock).toHaveBeenCalledWith("metric:1");
    });
    expect(selection.removeBlock).toHaveBeenCalledWith("dim:customer.segment");
    expect(selection.removeBlock).toHaveBeenCalledTimes(2);
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith("agent", "metrics");
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
      "agent",
      "dimensions",
    );
    expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
      "agent",
      "timelines",
    );
  });

  it("deselects members from a remove_from_research_plan tool call response", async () => {
    const { selection, rerender } = setup();

    const removeMembersMessage: MetabotDebugToolCallMessage = {
      id: "tool-call-5",
      role: "agent",
      type: "tool_call",
      name: "remove_from_research_plan",
      status: "ended",
      result: JSON.stringify({
        members: [
          { block_id: "metric:1", dimension_ids: ["revenue.created_at"] },
          { block_id: "dim:customer.segment", metric_ids: [2] },
        ],
      }),
    };

    rerender({
      messages: [userMessage, removeMembersMessage, agentMessage],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(selection.removeBlockMembers).toHaveBeenCalledWith("metric:1", {
        metricIds: undefined,
        dimensionIds: ["revenue.created_at"],
      });
    });
    expect(selection.removeBlockMembers).toHaveBeenCalledWith(
      "dim:customer.segment",
      { metricIds: [2], dimensionIds: undefined },
    );
    expect(selection.removeBlock).not.toHaveBeenCalled();
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith("agent", "metrics");
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
      "agent",
      "dimensions",
    );
    expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
      "agent",
      "timelines",
    );
  });

  it("removes timelines from a remove_from_research_plan tool call response", async () => {
    const { selection, rerender } = setup();

    const removeTimelinesMessage: MetabotDebugToolCallMessage = {
      id: "tool-call-6",
      role: "agent",
      type: "tool_call",
      name: "remove_from_research_plan",
      status: "ended",
      result: JSON.stringify({ timeline_ids: [7, 9] }),
    };

    rerender({
      messages: [userMessage, removeTimelinesMessage, agentMessage],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(selection.removeTimelinesById).toHaveBeenCalledWith([7, 9]);
    });
    expect(selection.removeBlock).not.toHaveBeenCalled();
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith(
      "agent",
      "timelines",
    );
    expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
      "agent",
      "metrics",
    );
    expect(trackExplorationPlanEdited).not.toHaveBeenCalledWith(
      "agent",
      "dimensions",
    );
  });

  it("does not re-apply tool calls that survive a conversation rewind/retry", async () => {
    const { selection, rerender } = setup();

    const secondUserMessage: MetabotChatMessage = {
      id: "user-2",
      role: "user",
      type: "text",
      message: "Remove the churn block",
    };
    const secondAgentMessage: MetabotChatMessage = {
      id: "agent-2",
      role: "agent",
      type: "text",
      message: "Removed.",
    };

    // Turn 1: name tool call is applied when the agent finishes.
    rerender({
      messages: [userMessage, setNameToolCallMessage, agentMessage],
      isDoingScience: false,
    });
    await waitFor(() => {
      expect(selection.setName).toHaveBeenCalledTimes(1);
    });

    // Turn 2: a later tool call is applied.
    rerender({
      messages: [
        userMessage,
        setNameToolCallMessage,
        agentMessage,
        secondUserMessage,
        removeFromResearchPlanToolCallMessage,
        secondAgentMessage,
      ],
      isDoingScience: false,
    });
    await waitFor(() => {
      expect(selection.removeBlock).toHaveBeenCalledTimes(2);
    });

    // Retrying turn 2 rewinds to that prompt — messages shrink, but turn 1's
    // tool-call id remains. The regenerated turn 2 uses a fresh tool-call id.
    const retriedRemoveToolCallMessage: MetabotDebugToolCallMessage = {
      ...removeFromResearchPlanToolCallMessage,
      id: "tool-call-4-retry",
      result: JSON.stringify({ block_ids: ["metric:1"] }),
    };
    const retriedSecondAgentMessage: MetabotChatMessage = {
      ...secondAgentMessage,
      id: "agent-2-retry",
    };

    rerender({
      messages: [userMessage, setNameToolCallMessage, agentMessage],
      isDoingScience: true,
    });
    rerender({
      messages: [
        userMessage,
        setNameToolCallMessage,
        agentMessage,
        secondUserMessage,
        retriedRemoveToolCallMessage,
        retriedSecondAgentMessage,
      ],
      isDoingScience: false,
    });

    await waitFor(() => {
      expect(selection.removeBlock).toHaveBeenCalledTimes(3);
    });
    expect(selection.removeBlock).toHaveBeenLastCalledWith("metric:1");
    // Turn 1's surviving tool call must not run again after the rewind.
    expect(selection.setName).toHaveBeenCalledTimes(1);
  });
});
