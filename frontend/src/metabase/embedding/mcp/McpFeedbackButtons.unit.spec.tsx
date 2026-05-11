import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { findRequests } from "__support__/server-mocks";
import { renderWithProviders } from "__support__/ui";

import { McpFeedbackButtons } from "./McpFeedbackButtons";

describe("McpFeedbackButtons", () => {
  beforeEach(() => {
    jest
      .spyOn(crypto, "randomUUID")
      .mockReturnValue("00000000-0000-4000-8000-000000000000");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("submits MCP feedback to the embed callback endpoint", async () => {
    const user = userEvent.setup();
    const instanceUrl = "http://localhost:3000";

    fetchMock.post(`${instanceUrl}/api/embed-mcp/feedback`, 204);

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

    await waitFor(async () => {
      expect(await findRequests("POST")).toHaveLength(1);
    });

    const [request] = await findRequests("POST");

    expect(request.url).toBe(`${instanceUrl}/api/embed-mcp/feedback`);

    expect(request.body).toEqual({
      feedback: {
        positive: true,
        message_id: "00000000-0000-4000-8000-000000000000",
        freeform_feedback: "Useful chart",
      },
      conversation_data: {
        source: "mcp",
        prompt: "show me orders",
        query: "encoded-query",
      },
    });
  });
});
