import {
  setupGetNotificationEndpoint,
  setupGetNotificationErrorEndpoint,
} from "__support__/server-mocks/notification";
import { renderWithProviders, waitFor } from "__support__/ui";
import {
  useMetabotAgent,
  useUserMetabotPermissions,
} from "metabase/metabot/hooks";
import { Route } from "metabase/router";
import { utf8_to_b64url } from "metabase/utils/encoding";
import {
  createMockCard,
  createMockNotification,
} from "metabase-types/api/mocks";

import { getMetabotQuickLinks } from "./MetabotQuickLinks";

jest.mock("metabase/metabot/hooks", () => ({
  ...jest.requireActual("metabase/metabot/hooks"),
  useMetabotAgent: jest.fn(),
  useUserMetabotPermissions: jest.fn(),
}));

const mockSubmitInput = jest.fn();

const card = createMockCard({ id: 42, name: "Weekly revenue" });
const notification = createMockNotification({
  id: 10,
  payload: {
    card_id: card.id,
    card,
    send_once: false,
    send_condition: "has_result",
  },
});

function setup({
  initialRoute,
  canUseMetabot = true,
}: {
  initialRoute: string;
  canUseMetabot?: boolean;
}) {
  jest.mocked(useUserMetabotPermissions).mockReturnValue({
    isLoading: false,
    isError: false,
    isConfigured: canUseMetabot,
    canConfigure: true,
    hasMetabotAccess: canUseMetabot,
    canUseMetabot,
    hasSqlGenerationAccess: canUseMetabot,
    canUseSqlGeneration: canUseMetabot,
    hasNlqAccess: canUseMetabot,
    canUseNlq: canUseMetabot,
    hasOtherToolsAccess: canUseMetabot,
    canUseOtherTools: canUseMetabot,
  });
  // the route only uses submitInput, so a full agent state isn't needed
  jest.mocked(useMetabotAgent).mockReturnValue({
    submitInput: mockSubmitInput,
  } as unknown as ReturnType<typeof useMetabotAgent>);

  return renderWithProviders(
    <>
      <Route path="/" element={<div />} />
      {getMetabotQuickLinks()}
    </>,
    {
      withRouter: true,
      initialRoute,
    },
  );
}

describe("MetabotNewRoute", () => {
  beforeEach(() => {
    mockSubmitInput.mockReset();
  });

  it("submits a plain prompt from ?q=", async () => {
    setup({ initialRoute: "/metabot/new?q=hello" });
    await waitFor(() =>
      expect(mockSubmitInput).toHaveBeenCalledWith("hello", {
        focusInput: true,
      }),
    );
  });

  describe("from an alert email", () => {
    it("seeds Metabot with what the alert is about, without AI output", async () => {
      setupGetNotificationEndpoint(notification);
      setup({
        initialRoute: "/metabot/new?alert=10&sent_at=2026-09-23T09%3A00%3A00Z",
      });

      await waitFor(() => expect(mockSubmitInput).toHaveBeenCalled());
      const [prompt] = mockSubmitInput.mock.calls[0];
      expect(prompt).toContain("[Weekly revenue](metabase://question/42)");
      expect(prompt).toContain("It fires when the question has results.");
      expect(prompt).not.toContain("Metabot's");
    });

    it("adds Metabot's summary from the run", async () => {
      setupGetNotificationEndpoint(notification);
      const ai = utf8_to_b64url(JSON.stringify({ summary: "Revenue fell." }));
      setup({ initialRoute: `/metabot/new?alert=10&ai=${ai}` });

      await waitFor(() => expect(mockSubmitInput).toHaveBeenCalled());
      expect(mockSubmitInput.mock.calls[0][0]).toContain(
        `Metabot's summary: "Revenue fell."`,
      );
    });

    it("ignores a malformed ai param", async () => {
      setupGetNotificationEndpoint(notification);
      setup({ initialRoute: "/metabot/new?alert=10&ai=not-json" });

      await waitFor(() => expect(mockSubmitInput).toHaveBeenCalled());
      expect(mockSubmitInput.mock.calls[0][0]).not.toContain("Metabot's");
    });

    it("builds the prompt from an unsaved alert's description, without fetching", async () => {
      const alert = utf8_to_b64url(
        JSON.stringify({
          card: { id: 7, name: "Draft alert card", type: "question" },
          send_condition: "goal_below",
        }),
      );
      setup({ initialRoute: `/metabot/new?alert=${alert}` });

      await waitFor(() => expect(mockSubmitInput).toHaveBeenCalled());
      const [prompt] = mockSubmitInput.mock.calls[0];
      expect(prompt).toContain("[Draft alert card](metabase://question/7)");
      expect(prompt).toContain("It fires when the results go below the goal.");
    });

    it("sends no prompt when the user can't read the alert", async () => {
      setupGetNotificationErrorEndpoint(10);
      const { router } = setup({ initialRoute: "/metabot/new?alert=10" });

      await waitFor(() => expect(router?.location.pathname).toBe("/"));
      expect(mockSubmitInput).not.toHaveBeenCalled();
    });

    it("does nothing when the user can't use Metabot", async () => {
      setupGetNotificationEndpoint(notification);
      const { router } = setup({
        initialRoute: "/metabot/new?alert=10",
        canUseMetabot: false,
      });

      await waitFor(() => expect(router?.location.pathname).toBe("/"));
      expect(mockSubmitInput).not.toHaveBeenCalled();
    });
  });
});
