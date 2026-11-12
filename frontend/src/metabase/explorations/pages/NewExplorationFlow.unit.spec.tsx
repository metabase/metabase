import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupExplorationDataEndpoint } from "__support__/server-mocks/metric";
import { setupTimelinesEndpoints } from "__support__/server-mocks/timeline";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";
import {
  trackExplorationAgentMessageSent,
  trackExplorationCreated,
  trackExplorationPlanEdited,
} from "metabase/explorations/analytics";
import { createExploration } from "metabase/explorations/test-utils";
import { MetabotProvider } from "metabase/metabot/context";
import { lastReqBody, mockAgentEndpoint } from "metabase/metabot/tests/utils";
import { Route } from "metabase/router";
import type {
  ExplorationDimensionGroup,
  ExplorationMetric,
} from "metabase-types/api";
import {
  createMockUser,
  createMockUserMetabotPermissions,
} from "metabase-types/api/mocks";
import {
  createMockMetric,
  createMockMetricDimension,
} from "metabase-types/api/mocks/metric";

import { NewExplorationDraftProvider } from "./NewExplorationDraftProvider";
import { NewExplorationPage } from "./NewExplorationPage";
import { NewExplorationPlanPage } from "./NewExplorationPlanPage";

jest.mock("metabase/explorations/analytics", () => ({
  ...jest.requireActual("metabase/explorations/analytics"),
  trackExplorationAgentMessageSent: jest.fn(),
  trackExplorationCreated: jest.fn(),
  trackExplorationPlanEdited: jest.fn(),
}));

const AGENT_NAME = "Signups investigation";
const CREATED_EXPLORATION_ID = 42;

const dimPlan = createMockMetricDimension({
  id: "accounts.plan",
  display_name: "Plan",
  dimension_interestingness: 0.9,
  sources: [{ type: "field", "field-id": 2 }],
});

const signupsMetric: ExplorationMetric = {
  ...createMockMetric({ id: 7, name: "Signups" }),
  dimension_ids: [dimPlan.id],
};

const planGroup: ExplorationDimensionGroup = {
  name: "Accounts",
  dimension_interestingness: 0.9,
  dimensions: [dimPlan],
};

const agentResponse: SSEEvent[] = [
  {
    type: "tool-input-available",
    toolCallId: "groups-1",
    toolName: "add_research_groups",
    input: {},
  },
  {
    type: "tool-output-available",
    toolCallId: "groups-1",
    output: "Added 1 group(s) to the research plan",
  },
  {
    type: "data-research_plan_update",
    id: "groups-1-data-0",
    data: {
      metrics: [signupsMetric],
      dimension_groups: [planGroup],
      groups: [{ metric_id: signupsMetric.id }],
      tool_call_id: "groups-1",
    },
  },
  {
    type: "tool-input-available",
    toolCallId: "name-1",
    toolName: "set_research_name",
    input: {},
  },
  {
    type: "tool-output-available",
    toolCallId: "name-1",
    output: { name: AGENT_NAME },
  },
];

function setup() {
  const agentSpy = mockAgentEndpoint({ events: agentResponse });
  fetchMock.get(
    "path:/api/metabot/permissions/user-permissions",
    createMockUserMetabotPermissions(),
  );
  fetchMock.get("path:/api/exploration/mine", {
    data: [],
    total: 0,
    limit: 25,
    offset: 0,
  });
  fetchMock.post("path:/api/exploration", {
    ...createExploration(),
    id: CREATED_EXPLORATION_ID,
  });
  setupExplorationDataEndpoint([]);
  setupTimelinesEndpoints([]);

  renderWithProviders(
    <Route
      path="/question/research"
      element={
        <MetabotProvider>
          <NewExplorationDraftProvider />
        </MetabotProvider>
      }
    >
      <Route index element={<NewExplorationPage />} />
      <Route path="plan" element={<NewExplorationPlanPage />} />
      <Route path=":id" element={<div data-testid="exploration-detail" />} />
    </Route>,
    {
      withRouter: true,
      initialRoute: "/question/research",
      storeInitialState: createMockState({
        currentUser: createMockUser(),
        settings: mockSettings({
          "metabot-enabled?": true,
          "llm-metabot-configured?": true,
        }),
      }),
    },
  );

  return { agentSpy };
}

describe("new exploration flow (agent-driven plan)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("fills the plan from the streamed agent reply and starts research with the agent's name", async () => {
    const { agentSpy } = setup();

    await userEvent.type(
      within(await screen.findByTestId("exploration-prompt-input")).getByRole(
        "textbox",
      ),
      "Why are signups down?",
    );
    await userEvent.click(screen.getByRole("button", { name: /Create plan/ }));

    expect(await lastReqBody(agentSpy)).toMatchObject({
      profile_id: "explorations",
    });
    expect(trackExplorationAgentMessageSent).toHaveBeenCalledWith("entry");

    const plan = await screen.findByTestId("research-content");
    expect(await within(plan).findByText("Signups")).toBeInTheDocument();
    expect(await screen.findByText(AGENT_NAME)).toBeInTheDocument();
    expect(trackExplorationPlanEdited).toHaveBeenCalledWith("agent", "metrics");

    await userEvent.click(
      within(plan).getByRole("button", { name: /Start research/ }),
    );

    expect(await screen.findByTestId("exploration-detail")).toBeInTheDocument();
    const createCall = fetchMock.callHistory.lastCall("path:/api/exploration", {
      method: "POST",
    });
    const createBody: unknown = JSON.parse(String(createCall?.options.body));
    expect(createBody).toMatchObject({ name: AGENT_NAME });
    await waitFor(() =>
      expect(trackExplorationCreated).toHaveBeenCalledWith(
        CREATED_EXPLORATION_ID,
      ),
    );
  });
});
