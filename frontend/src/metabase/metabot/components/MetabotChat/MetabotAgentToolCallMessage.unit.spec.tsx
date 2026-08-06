import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state";

import { AgentToolCallMessage } from "./MetabotAgentToolCallMessage";

const createMockToolCall = (
  overrides: Partial<MetabotDebugToolCallMessage> = {},
): MetabotDebugToolCallMessage => ({
  id: "tool-call-1",
  role: "agent",
  type: "tool_call",
  name: "search_cards",
  status: "ended",
  args: '{"query":"revenue"}',
  result: '{"cards":[1,2]}',
  ...overrides,
});

const setup = ({
  message = createMockToolCall(),
  onSelect,
}: {
  message?: MetabotDebugToolCallMessage;
  onSelect?: (message: MetabotDebugToolCallMessage) => void;
} = {}) => {
  renderWithProviders(
    <AgentToolCallMessage message={message} onSelect={onSelect} />,
  );
  return { message };
};

describe("AgentToolCallMessage", () => {
  describe("without onSelect (normal Metabot chat)", () => {
    it("opens the details modal on click", async () => {
      const { message } = setup();

      expect(
        screen.queryByTestId("tool-call-details-modal"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(message.name) }),
      );

      const modal = await screen.findByTestId("tool-call-details-modal");
      expect(modal).toBeInTheDocument();
      expect(
        within(modal).getByText(`Tool Call: ${message.name}`),
      ).toBeInTheDocument();
      expect(within(modal).getByText(message.id)).toBeInTheDocument();
      expect(within(modal).getByText("Request")).toBeInTheDocument();
      expect(within(modal).getByText("Response")).toBeInTheDocument();
    });

    it("opens the details modal via keyboard", async () => {
      const { message } = setup();

      const card = screen.getByRole("button", {
        name: new RegExp(message.name),
      });
      card.focus();
      await userEvent.keyboard("{Enter}");

      expect(
        await screen.findByTestId("tool-call-details-modal"),
      ).toBeInTheDocument();
    });

    it("closes the details modal again", async () => {
      const { message } = setup();

      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(message.name) }),
      );
      expect(
        await screen.findByTestId("tool-call-details-modal"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: /close/i }));

      await waitFor(() => {
        expect(
          screen.queryByTestId("tool-call-details-modal"),
        ).not.toBeInTheDocument();
      });
    });
  });

  describe("with onSelect (Monitor conversation detail)", () => {
    it("delegates to onSelect and does not open the modal", async () => {
      const onSelect = jest.fn();
      const { message } = setup({ onSelect });

      await userEvent.click(
        screen.getByRole("button", { name: new RegExp(message.name) }),
      );

      expect(onSelect).toHaveBeenCalledWith(message);
      expect(
        screen.queryByTestId("tool-call-details-modal"),
      ).not.toBeInTheDocument();
    });
  });
});
