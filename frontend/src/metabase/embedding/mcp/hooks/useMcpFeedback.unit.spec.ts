import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { renderHookWithProviders, waitFor } from "__support__/ui";

import { useMcpFeedback } from "./useMcpFeedback";

describe("useMcpFeedback", () => {
  const randomUuidSpy = jest.spyOn(crypto, "randomUUID");
  const feedbackMessageId = "11111111-1111-1111-1111-111111111111";

  beforeEach(() => {
    randomUuidSpy.mockReturnValue(feedbackMessageId);
    fetchMock.post("path:/api/embed-mcp/feedback", 200);
  });

  afterEach(() => {
    randomUuidSpy.mockReset();
  });

  it("submits the MCP feedback payload", async () => {
    const { result } = renderHookWithProviders(
      () =>
        useMcpFeedback({
          instanceUrl: "https://metabase.example",
          mcpSessionId: "mcp-session-id",
          prompt: "visualize customers",
          query: "encoded-query",
          sessionToken: "session-token",
        }),
      {},
    );

    act(() => {
      result.current.setSelectedFeedback("negative");
    });

    await act(async () => {
      await result.current.handleFeedbackSubmit({
        issue_type: "wrong-visualization",
        freeform_feedback: "Needs a different chart",
      });
    });

    await waitFor(() => {
      expect(fetchMock.callHistory.called("path:/api/embed-mcp/feedback")).toBe(
        true,
      );
    });

    const lastCall = fetchMock.callHistory.lastCall(
      "path:/api/embed-mcp/feedback",
      { method: "POST" },
    );

    expect(JSON.parse(lastCall?.options?.body as string)).toEqual({
      feedback: {
        positive: false,
        message_id: feedbackMessageId,
        issue_type: "wrong-visualization",
        freeform_feedback: "Needs a different chart",
      },
      conversation_data: {
        source: "mcp",
        prompt: "visualize customers",
        query: "encoded-query",
      },
    });
  });
});
