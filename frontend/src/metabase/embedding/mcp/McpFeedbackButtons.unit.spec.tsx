import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { renderWithProviders } from "__support__/ui";

import { McpFeedbackButtons } from "./McpFeedbackButtons";

const POSITIVE_FEEDBACK_MESSAGE_ID = "00000000-0000-4000-8000-000000000001";
const NEGATIVE_FEEDBACK_MESSAGE_ID = "00000000-0000-4000-8000-000000000002";

describe("McpFeedbackButtons", () => {
  beforeEach(() => {
    jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValueOnce(POSITIVE_FEEDBACK_MESSAGE_ID)
      .mockReturnValueOnce(NEGATIVE_FEEDBACK_MESSAGE_ID);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const findFeedbackRequests = async () => {
    await fetchMock.callHistory.flush();

    return fetchMock.callHistory.calls("path:/api/embed-mcp/feedback", {
      method: "POST",
    });
  };

  const getRequestBody = (
    request: ReturnType<typeof fetchMock.callHistory.calls>[number],
  ) => JSON.parse(request.options.body?.toString() ?? "{}");

  const getRequestHeaders = (
    request: ReturnType<typeof fetchMock.callHistory.calls>[number],
  ) => request.options.headers as Record<string, string>;

  it("submits separate MCP feedback events to the feedback endpoint", async () => {
    const user = userEvent.setup();
    const instanceUrl = "http://localhost:3000";

    fetchMock.post("path:/api/embed-mcp/feedback", 204);

    renderWithProviders(
      <McpFeedbackButtons
        instanceUrl={instanceUrl}
        sessionToken="metabase-session-token"
        mcpSessionId="mcp-session-id"
        prompt="show me orders"
        query="encoded-query"
      />,
    );

    await user.click(screen.getByTestId("mcp-feedback-thumbs-up"));

    await user.type(
      screen.getByPlaceholderText("Tell us what you liked!"),
      "Useful chart",
    );

    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/embed-mcp/feedback", {
          method: "POST",
        }),
      ).toHaveLength(1),
    );

    const [request] = await findFeedbackRequests();

    expect(request.url).toBe(`${instanceUrl}/api/embed-mcp/feedback`);
    expect(getRequestHeaders(request)).toEqual(
      expect.objectContaining({
        "x-metabase-client": "mcp-apps",
        "x-metabase-session": "metabase-session-token",
        "mcp-session-id": "mcp-session-id",
      }),
    );

    expect(getRequestBody(request)).toEqual({
      feedback: {
        positive: true,
        message_id: POSITIVE_FEEDBACK_MESSAGE_ID,
        freeform_feedback: "Useful chart",
      },
      conversation_data: {
        source: "mcp",
        prompt: "show me orders",
        query: "encoded-query",
      },
    });

    await user.click(screen.getByTestId("mcp-feedback-thumbs-down"));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(async () =>
      expect(await findFeedbackRequests()).toHaveLength(2),
    );

    const [, secondRequest] = await findFeedbackRequests();

    expect(getRequestBody(secondRequest)).toEqual({
      feedback: {
        positive: false,
        message_id: NEGATIVE_FEEDBACK_MESSAGE_ID,
      },
      conversation_data: {
        source: "mcp",
        prompt: "show me orders",
        query: "encoded-query",
      },
    });
  });

  it("keeps an in-flight submission tied to the visualization it was submitted for", async () => {
    const user = userEvent.setup();
    const instanceUrl = "http://localhost:3000";
    let resolveFeedback!: (status: number) => void;
    const feedbackSubmission = new Promise<number>((resolve) => {
      resolveFeedback = resolve;
    });

    fetchMock.post("path:/api/embed-mcp/feedback", () => feedbackSubmission);

    const { rerender } = renderWithProviders(
      <McpFeedbackButtons
        instanceUrl={instanceUrl}
        sessionToken="metabase-session-token"
        mcpSessionId="mcp-session-id"
        prompt="show me orders"
        query="encoded-query"
      />,
    );

    await user.click(screen.getByTestId("mcp-feedback-thumbs-up"));
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(
        fetchMock.callHistory.calls("path:/api/embed-mcp/feedback", {
          method: "POST",
        }),
      ).toHaveLength(1),
    );

    rerender(
      <McpFeedbackButtons
        instanceUrl={instanceUrl}
        sessionToken="metabase-session-token"
        mcpSessionId="mcp-session-id"
        prompt="show me products"
        query="new-encoded-query"
      />,
    );

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Submit" }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("mcp-feedback-thumbs-up")).toBeDisabled();

    await act(async () => {
      resolveFeedback(204);
      await feedbackSubmission;
    });

    await waitFor(() =>
      expect(screen.getByTestId("mcp-feedback-thumbs-up")).toBeEnabled(),
    );
  });
});
