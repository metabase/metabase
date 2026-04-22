import api from "metabase/utils/api";
import type {
  CardId,
  DashCardId,
  Dataset,
  DatasetData,
  RowValues,
} from "metabase-types/api";

type BatchCardBegin = {
  type: "card-begin";
  dashcard_id: DashCardId;
  card_id: CardId;
  // A partial DatasetData — what's known before rows are reduced (cols, native_form, etc.).
  data: Partial<DatasetData> & Record<string, unknown>;
};

type BatchCardRows = {
  type: "card-rows";
  dashcard_id: DashCardId;
  card_id: CardId;
  rows: RowValues[];
};

type BatchCardEnd = {
  type: "card-end";
  dashcard_id: DashCardId;
  card_id: CardId;
  row_count: number;
  status: string;
  running_time?: number;
  data: Partial<DatasetData> & Record<string, unknown>;
} & Record<string, unknown>;

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

type BatchMessage =
  | BatchCardBegin
  | BatchCardRows
  | BatchCardEnd
  | BatchCardError
  | BatchComplete;

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

type PartialCard = {
  beginData: Partial<DatasetData> & Record<string, unknown>;
  rows: RowValues[];
};

const keyOf = (dashcardId: DashCardId, cardId: CardId) =>
  `${dashcardId}:${cardId}`;

// Mirrors the `:word` substitution loop inside Api._makeMethod so that embed
// token refresh (which swaps a JWT in the URL for a `:entityIdentifier`
// placeholder) lands the refreshed value in the fetch URL.
function substituteUrlParams(
  url: string,
  data: Record<string, unknown>,
): string {
  const tags = url.match(/:\w+/g);
  if (!tags) {
    return url;
  }
  return tags.reduce((acc, tag) => {
    const value = data[tag.slice(1)];
    if (value === undefined) {
      return acc;
    }
    return acc.replace(tag, encodeURIComponent(String(value)));
  }, url);
}

function assembleDataset(partial: PartialCard, end: BatchCardEnd): Dataset {
  // End-side `data` fields win over begin-side (they represent the final state), and rows are
  // the concatenated row chunks.
  const mergedData = {
    ...partial.beginData,
    ...end.data,
    rows: partial.rows,
  } as DatasetData;
  const { type: _t, dashcard_id: _dc, card_id: _cid, data: _d, ...rest } = end;
  return { ...rest, data: mergedData } as unknown as Dataset;
}

function handleMessage(
  msg: BatchMessage,
  partial: Map<string, PartialCard>,
  callbacks: BatchCallbacks,
): void {
  switch (msg.type) {
    case "card-begin": {
      partial.set(keyOf(msg.dashcard_id, msg.card_id), {
        beginData: msg.data ?? {},
        rows: [],
      });
      return;
    }
    case "card-rows": {
      const entry = partial.get(keyOf(msg.dashcard_id, msg.card_id));
      if (entry) {
        for (const row of msg.rows) {
          entry.rows.push(row);
        }
      }
      return;
    }
    case "card-end": {
      const key = keyOf(msg.dashcard_id, msg.card_id);
      const entry = partial.get(key);
      if (entry) {
        partial.delete(key);
        callbacks.onCardResult(
          msg.dashcard_id,
          msg.card_id,
          assembleDataset(entry, msg),
        );
      }
      return;
    }
    case "card-error": {
      partial.delete(keyOf(msg.dashcard_id, msg.card_id));
      callbacks.onCardError(msg.dashcard_id, msg.card_id, msg.error);
      return;
    }
    case "complete": {
      callbacks.onComplete({
        total: msg.total,
        succeeded: msg.succeeded,
        failed: msg.failed,
      });
      if (partial.size > 0) {
        console.warn(
          `streamBatchCardQuery: ${partial.size} card(s) never completed`,
          Array.from(partial.keys()),
        );
        partial.clear();
      }
      return;
    }
  }
}

export async function streamBatchCardQuery(
  config: BatchRequestConfig,
  callbacks: BatchCallbacks,
): Promise<void> {
  const { method = "POST", body, signal } = config;
  // Route the request through the same middleware the standard Api class uses
  // so embed token refresh, session headers, CSRF, X-Metabase-Client, etc. all
  // apply. We fetch() directly afterwards because the Api class can't yield a
  // streaming response.
  const { url: transformedUrl, data: transformedData } =
    await api.apiRequestManipulationMiddleware({
      url: config.url,
      method,
      options: {},
      data: {},
    });
  const url = substituteUrlParams(transformedUrl, transformedData);
  const headers: Record<string, string> = { ...api.getClientHeaders() };
  const fetchInit: RequestInit = { method, signal, headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    fetchInit.body = JSON.stringify(body);
  }
  const response = await fetch(url, fetchInit);

  if (!response.ok) {
    // Surface the server-side message (e.g. "You must specify a value for :source
    // in the JWT.") so callers can render it on every card in the batch.
    let message = `Batch card query failed: ${response.status}`;
    try {
      const text = await response.text();
      if (text) {
        try {
          const json = JSON.parse(text);
          message = json.message ?? json.error ?? text;
        } catch {
          message = text;
        }
      }
    } catch {
      // ignore body-read errors
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = response.status;
    throw err;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Response body is not readable");
  }

  const decoder = new TextDecoder();
  const partial = new Map<string, PartialCard>();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop()!;

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }
        handleMessage(JSON.parse(trimmed) as BatchMessage, partial, callbacks);
      }
    }

    if (buffer.trim()) {
      handleMessage(
        JSON.parse(buffer.trim()) as BatchMessage,
        partial,
        callbacks,
      );
    }
  } finally {
    reader.releaseLock();
  }
}
