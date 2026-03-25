import type { CardId, DashCardId, Dataset } from "metabase-types/api";

type BatchCardResult = {
  type: "card-result";
  dashcard_id: DashCardId;
  card_id: CardId;
  result: Dataset;
};

type BatchCardError = {
  type: "card-error";
  dashcard_id: DashCardId;
  card_id: CardId;
  error: { status: number; message: string };
};

type BatchComplete = {
  type: "complete";
  total: number;
  succeeded: number;
  failed: number;
};

type BatchMessage = BatchCardResult | BatchCardError | BatchComplete;

export type BatchCallbacks = {
  onCardResult: (
    dashcardId: DashCardId,
    cardId: CardId,
    result: Dataset,
  ) => void;
  onCardError: (
    dashcardId: DashCardId,
    cardId: CardId,
    error: { status: number; message: string },
  ) => void;
  onComplete: (summary: {
    total: number;
    succeeded: number;
    failed: number;
  }) => void;
};

export type BatchCardSpec = {
  dashcard_id: DashCardId;
  card_id: CardId;
};

export type BatchRequestConfig = {
  url: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  signal?: AbortSignal;
};

export async function streamBatchCardQuery(
  config: BatchRequestConfig,
  callbacks: BatchCallbacks,
): Promise<void> {
  const { url, method = "POST", body, signal } = config;
  const fetchInit: RequestInit = { method, signal };
  if (body) {
    fetchInit.headers = { "Content-Type": "application/json" };
    fetchInit.body = JSON.stringify(body);
  }
  const response = await fetch(url, fetchInit);

  if (!response.ok) {
    throw new Error(`Batch card query failed: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // Keep the last (potentially incomplete) line in the buffer
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const msg: BatchMessage = JSON.parse(trimmed);
        switch (msg.type) {
          case "card-result":
            callbacks.onCardResult(msg.dashcard_id, msg.card_id, msg.result);
            break;
          case "card-error":
            callbacks.onCardError(msg.dashcard_id, msg.card_id, msg.error);
            break;
          case "complete":
            callbacks.onComplete(msg);
            break;
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const msg: BatchMessage = JSON.parse(buffer.trim());
      switch (msg.type) {
        case "card-result":
          callbacks.onCardResult(msg.dashcard_id, msg.card_id, msg.result);
          break;
        case "card-error":
          callbacks.onCardError(msg.dashcard_id, msg.card_id, msg.error);
          break;
        case "complete":
          callbacks.onComplete(msg);
          break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
