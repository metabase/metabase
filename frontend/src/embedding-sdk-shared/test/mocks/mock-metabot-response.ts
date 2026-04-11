import { http } from "msw";

export const MOCK_AD_HOC_QUESTION_ID =
  "/question#eyJkYXRhc2V0X3F1ZXJ5IjogeyJkYXRhYmFzZSI6IDEsICJ0eXBlIjogInF1ZXJ5IiwgInF1ZXJ5IjogeyJzb3VyY2UtdGFibGUiOiAiY2FyZF9fMSJ9fSwgImRpc3BsYXkiOiAidGFibGUiLCAiZGlzcGxheUlzTG9ja2VkIjogdHJ1ZSwgInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOiB7fX0=";

type StreamEvent = Record<string, unknown> | string;

export const mockStreamResponse = (events: StreamEvent[]) => {
  return http.post("*/api/metabot/agent-streaming", () => {
    const encoder = new TextEncoder();
    const sseFrames = [...events, { type: "finish" }, "[DONE]"].map((e) => {
      const payload = typeof e === "string" ? e : JSON.stringify(e);
      return `data: ${payload}\n\n`;
    });

    const stream = new ReadableStream({
      start(controller) {
        let i = 0;

        const pushNext = () => {
          if (i < sseFrames.length) {
            controller.enqueue(encoder.encode(sseFrames[i]));
            i++;
            setTimeout(pushNext, 100);
          } else {
            controller.close();
          }
        };

        pushNext();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  });
};
