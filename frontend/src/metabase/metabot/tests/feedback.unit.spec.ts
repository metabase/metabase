import userEvent from "@testing-library/user-event";

import { screen, within } from "__support__/ui";

import {
  enterChatMessage,
  feedbackModal,
  lastChatMessage,
  mockAgentEndpoint,
  mockFeedbackEndpoint,
  setup,
  thumbsDown,
  thumbsUp,
  whoIsYourFavoriteResponse,
} from "./utils";

const setupWithNegativeFeedback = async () => {
  setup({ isHosted: true });
  const feedbackEndpoint = mockFeedbackEndpoint();
  mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

  await enterChatMessage("Who is your favorite?");
  const lastMessage = (await lastChatMessage())!;

  await userEvent.click(await thumbsDown(lastMessage));
  const modal = await feedbackModal();

  return { feedbackEndpoint, lastMessage, modal };
};

const selectIssueType = async (modal: HTMLElement, issueType: string) => {
  await userEvent.click(
    await within(modal).findByPlaceholderText("Select issue type"),
  );
  await userEvent.click(await screen.findByText(issueType));
};

const typeFeedback = async (modal: HTMLElement, text: string) => {
  await userEvent.type(
    await within(modal).findByPlaceholderText(
      "What could be improved about this response?",
    ),
    text,
  );
};

const submitFeedback = async (modal: HTMLElement) => {
  await userEvent.click(
    await within(modal).findByRole("button", { name: /Submit/ }),
  );
};

describe("metabot > feedback", () => {
  it("should not show feedback buttons for non-hosted instances", async () => {
    setup({ isHosted: false });
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");
    const lastMessage = (await lastChatMessage())!;

    expect(
      within(lastMessage).queryByTestId("metabot-chat-message-thumbs-up"),
    ).not.toBeInTheDocument();
    expect(
      within(lastMessage).queryByTestId("metabot-chat-message-thumbs-down"),
    ).not.toBeInTheDocument();
  });

  it("should present the user an option to provide feedback for hosted instances", async () => {
    setup({ isHosted: true });
    const feedbackEndpoint = mockFeedbackEndpoint();
    mockAgentEndpoint({ events: whoIsYourFavoriteResponse });

    await enterChatMessage("Who is your favorite?");
    const lastMessage = (await lastChatMessage())!;
    expect(lastMessage).toHaveTextContent(/You, but don't tell anyone./);

    expect(await thumbsUp(lastMessage)).toBeInTheDocument();
    expect(await thumbsDown(lastMessage)).toBeInTheDocument();
    await userEvent.click(await thumbsDown(lastMessage));

    const modal = await feedbackModal();
    expect(modal).toBeInTheDocument();
    await submitFeedback(modal);

    expect(feedbackEndpoint.calls()).toHaveLength(1);

    expect(await thumbsUp(lastMessage)).toBeDisabled();
    expect(await thumbsDown(lastMessage)).toBeDisabled();
  });

  it("should prevent submission when ui-bug is selected with empty feedback", async () => {
    const { feedbackEndpoint, modal } = await setupWithNegativeFeedback();

    await selectIssueType(modal, "UI bug");
    await submitFeedback(modal);

    expect(await within(modal).findByText("required")).toBeInTheDocument();
    expect(feedbackEndpoint.calls()).toHaveLength(0);
  });

  it("should allow submission when ui-bug is selected with feedback text", async () => {
    const { feedbackEndpoint, modal } = await setupWithNegativeFeedback();

    await selectIssueType(modal, "UI bug");
    await typeFeedback(modal, "The button is in the wrong place");
    await submitFeedback(modal);

    expect(feedbackEndpoint.calls()).toHaveLength(1);
  });

  it("should prevent submission when other is selected with empty feedback", async () => {
    const { feedbackEndpoint, modal } = await setupWithNegativeFeedback();

    await selectIssueType(modal, "Other");
    await submitFeedback(modal);

    expect(await within(modal).findByText("required")).toBeInTheDocument();
    expect(feedbackEndpoint.calls()).toHaveLength(0);
  });

  it("should allow submission when non-required issue types have empty feedback", async () => {
    const { feedbackEndpoint, modal } = await setupWithNegativeFeedback();

    await selectIssueType(modal, "Not factually correct");
    await submitFeedback(modal);

    expect(feedbackEndpoint.calls()).toHaveLength(1);
  });
});
