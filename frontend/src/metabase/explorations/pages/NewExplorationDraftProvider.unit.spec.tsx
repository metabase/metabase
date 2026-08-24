import { useState } from "react";

import { act, renderWithProviders, screen } from "__support__/ui";
import type { ExplorationSelection } from "metabase/explorations/hooks";
import { makeMockSelection } from "metabase/explorations/test-utils";
import {
  getMessages,
  getMetabotConversationId,
  metabotActions,
} from "metabase/metabot/state";
import { Route } from "metabase/router";

import { NewExplorationDraftProvider } from "./NewExplorationDraftProvider";
import { NewExplorationPage } from "./NewExplorationPage";
import { NewExplorationPlanPage } from "./NewExplorationPlanPage";

const mockRendered: {
  entry?: ExplorationSelection;
  plan?: ExplorationSelection;
} = {};

jest.mock("../hooks", () => ({
  useExplorationSelection: jest.fn(),
}));

jest.mock("../components/NewExplorationChat/NewExplorationChat", () => ({
  EXPLORATIONS_AGENT_ID: "explorations",
  NewExplorationChat: () => null,
}));

jest.mock("../components/NewExplorationEntry", () => ({
  NewExplorationEntry: ({ selection }: { selection: ExplorationSelection }) => {
    mockRendered.entry = selection;
    return null;
  },
}));

jest.mock("../components/NewExplorationPlan", () => ({
  NewExplorationPlan: ({ selection }: { selection: ExplorationSelection }) => {
    mockRendered.plan = selection;
    return null;
  },
}));

function setup() {
  const { useExplorationSelection } = jest.requireMock("../hooks");
  // like the real hook: one identity per mounted instance, new one on remount
  jest.mocked(useExplorationSelection).mockImplementation(() => {
    const [selection] = useState(makeMockSelection);
    return selection;
  });

  const { router, store } = renderWithProviders(
    // mirrors the prod route structure: the provider wraps only the
    // entry + plan routes, not the `:id` detail routes
    <Route path="/question/research">
      <Route element={<NewExplorationDraftProvider />}>
        <Route index element={<NewExplorationPage />} />
        <Route path="plan" element={<NewExplorationPlanPage />} />
      </Route>
      <Route path=":id" element={<div data-testid="detail-page" />} />
    </Route>,
    {
      withRouter: true,
      initialRoute: "/question/research",
    },
  );

  const draftConversationId = () =>
    getMetabotConversationId(store.getState(), "explorations");

  // stand-in for the request "Create plan" fires just before navigating
  const submitDraftMessage = () =>
    act(() => {
      store.dispatch(
        metabotActions.addUserMessage({
          conversationId: draftConversationId(),
          id: "draft-1",
          type: "text",
          message: "Why are signups down?",
        }),
      );
    });

  const getDraftMessages = () =>
    getMessages(store.getState(), draftConversationId());

  return {
    router,
    submitDraftMessage,
    getDraftMessages,
    useExplorationSelection: jest.mocked(useExplorationSelection),
  };
}

describe("NewExplorationDraftProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete mockRendered.entry;
    delete mockRendered.plan;
  });

  it("keeps one draft and conversation across the plan step and browser back/forward (UXW-4832)", () => {
    const { router, submitDraftMessage, getDraftMessages } = setup();

    submitDraftMessage();
    act(() => {
      router?.navigate("/question/research/plan");
    });

    // shared draft, and no conversation reset that would cancel the agent run
    // Create plan just started
    const shared = mockRendered.entry;
    expect(mockRendered.plan).toBe(shared);
    expect(getDraftMessages()).toHaveLength(1);

    act(() => {
      router?.back();
    });
    act(() => {
      router?.forward();
    });

    expect(mockRendered.entry).toBe(shared);
    expect(mockRendered.plan).toBe(shared);
    expect(getDraftMessages()).toHaveLength(1);
  });

  it("does not mount the draft on the exploration detail routes", () => {
    const {
      router,
      submitDraftMessage,
      getDraftMessages,
      useExplorationSelection,
    } = setup();

    submitDraftMessage();
    useExplorationSelection.mockClear();

    act(() => {
      router?.navigate("/question/research/123");
    });

    expect(screen.getByTestId("detail-page")).toBeInTheDocument();
    expect(useExplorationSelection).not.toHaveBeenCalled();
    expect(getDraftMessages()).toHaveLength(1);
  });

  it("starts a fresh draft and conversation on an explicit new visit to the entry page", () => {
    const { router, submitDraftMessage, getDraftMessages } = setup();

    submitDraftMessage();
    act(() => {
      router?.navigate("/question/research/plan");
    });
    const shared = mockRendered.plan;

    // what the "All projects" link does
    act(() => {
      router?.navigate("/question/research");
    });

    expect(mockRendered.entry).not.toBe(shared);
    expect(getDraftMessages()).toHaveLength(0);
  });
});
