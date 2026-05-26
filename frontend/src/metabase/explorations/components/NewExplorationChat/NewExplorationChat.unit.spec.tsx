import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, waitFor } from "__support__/ui";
import { makeMockSelection } from "metabase/explorations/test-utils";
import { useMetabotAgent } from "metabase/metabot/hooks";
import type {
  MetabotChatMessage,
  MetabotDebugToolCallMessage,
} from "metabase/metabot/state";
import { createMockState } from "metabase/redux/store/mocks";
import type { GetExplorationDataResponse } from "metabase-types/api";
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

const explorationDataResponse: GetExplorationDataResponse = {
  metrics: [metricRevenue, metricChurn],
  dimension_groups: [
    {
      name: "Created At",
      dimension_interestingness: 0.85,
      dimensions: [revenueDateDimension],
    },
    {
      name: "Customer Segment",
      dimension_interestingness: 0.3,
      dimensions: [customerSegmentDimension],
    },
    {
      name: "Product Category",
      dimension_interestingness: null,
      dimensions: [productCategoryDimension],
    },
  ],
};

const explorationDataToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-2",
  role: "agent",
  type: "tool_call",
  name: "select_research_metrics",
  status: "ended",
  result: JSON.stringify(explorationDataResponse),
};

const setNameToolCallMessage: MetabotDebugToolCallMessage = {
  id: "tool-call-3",
  role: "agent",
  type: "tool_call",
  name: "set_research_name",
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

  it("adds metrics and dimensions from an exploration data tool call response", async () => {
    const { selection, rerender } = setup();

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

    expect(selection.addMetric).not.toHaveBeenCalled();

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
      expect(selection.addMetric).toHaveBeenCalledTimes(2);
    });

    // Each metric is passed to addMetric with a dimensionsById map built
    // from the response's dimension_groups.
    expect(selection.addMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        id: metricRevenue.id,
        name: metricRevenue.name,
      }),
      { dimensionsById: expect.any(Map) },
    );
    expect(selection.addMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        id: metricChurn.id,
        name: metricChurn.name,
      }),
      { dimensionsById: expect.any(Map) },
    );

    // The dimensionsById map should contain every dimension from the groups.
    const { dimensionsById } = jest.mocked(selection.addMetric).mock
      .calls[0][1];
    expect(dimensionsById.size).toBe(3);
    expect(dimensionsById.get(revenueDateDimension.id)).toEqual(
      revenueDateDimension,
    );
    expect(dimensionsById.get(customerSegmentDimension.id)).toEqual(
      customerSegmentDimension,
    );
    expect(dimensionsById.get(productCategoryDimension.id)).toEqual(
      productCategoryDimension,
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
});
