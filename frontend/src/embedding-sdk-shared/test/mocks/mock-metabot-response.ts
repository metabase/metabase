import { http } from "msw";

export const MOCK_AD_HOC_QUESTION_ID =
  "/question#eyJkYXRhc2V0X3F1ZXJ5IjogeyJkYXRhYmFzZSI6IDEsICJ0eXBlIjogInF1ZXJ5IiwgInF1ZXJ5IjogeyJzb3VyY2UtdGFibGUiOiAiY2FyZF9fMSJ9fSwgImRpc3BsYXkiOiAidGFibGUiLCAiZGlzcGxheUlzTG9ja2VkIjogdHJ1ZSwgInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOiB7fX0=";

export const mockStreamResponse = (events: object[]) => {
  return http.post("*/api/metabot/agent-streaming", () => {
    const encoder = new TextEncoder();
    const lines = [...events.map((event) => JSON.stringify(event)), "[DONE]"];

    const stream = new ReadableStream({
      start(controller) {
        let i = 0;

        const pushNext = () => {
          if (i < lines.length) {
            controller.enqueue(encoder.encode(`data: ${lines[i]}\n\n`));
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
