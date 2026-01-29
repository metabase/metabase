import { http } from "msw";

export const MOCK_AD_HOC_QUESTION_ID =
  "/question#eyJkYXRhc2V0X3F1ZXJ5IjogeyJkYXRhYmFzZSI6IDEsICJ0eXBlIjogInF1ZXJ5IiwgInF1ZXJ5IjogeyJzb3VyY2UtdGFibGUiOiAiY2FyZF9fMSJ9fSwgImRpc3BsYXkiOiAidGFibGUiLCAiZGlzcGxheUlzTG9ja2VkIjogdHJ1ZSwgInZpc3VhbGl6YXRpb25fc2V0dGluZ3MiOiB7fX0=";

export const mockStreamResponse = (chunks: string[]) => {
  return http.post("*/api/ee/metabot-v3/native-agent-streaming", () => {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        let i = 0;

        const pushNext = () => {
          if (i < chunks.length) {
            controller.enqueue(encoder.encode(`${chunks[i]}\n`));
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
