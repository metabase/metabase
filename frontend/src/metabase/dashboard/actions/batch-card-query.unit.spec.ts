import { buildCardQueryBatchNdjson } from "__support__/server-mocks/dashcard";
import { createMockDataset } from "metabase-types/api/mocks";

import { streamBatchCardQuery } from "./batch-card-query";

function ndjsonResponse(body: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(body));
      controller.close();
    },
  });
  return { ok: true, status: 200, body: stream } as unknown as Response;
}

function setupFetch(body: string) {
  const original = global.fetch;
  global.fetch = (async () => ndjsonResponse(body)) as typeof fetch;
  return () => {
    global.fetch = original;
  };
}

describe("streamBatchCardQuery card-error handling", () => {
  it("delivers a failed Dataset envelope to onCardError", async () => {
    const body = buildCardQueryBatchNdjson(
      [{ id: 11, card_id: 22 }],
      createMockDataset(),
      new Map([
        [
          11,
          {
            error: "boom",
            error_type: "missing-required-permissions",
            error_is_curated: true,
          },
        ],
      ]),
    );
    const restore = setupFetch(body);

    const onCardResult = jest.fn();
    const onCardError = jest.fn();
    const onComplete = jest.fn();

    try {
      await streamBatchCardQuery(
        { url: "/api/dashboard/1/card-query-batch", method: "POST" },
        { onCardResult, onCardError, onComplete },
      );
    } finally {
      restore();
    }

    expect(onCardResult).not.toHaveBeenCalled();
    expect(onCardError).toHaveBeenCalledTimes(1);

    const [dashcardId, cardId, dataset] = onCardError.mock.calls[0];
    expect(dashcardId).toBe(11);
    expect(cardId).toBe(22);
    expect(dataset).toEqual({
      status: "failed",
      error: "boom",
      error_type: "missing-required-permissions",
      error_is_curated: true,
      data: { cols: [], rows: [] },
    });
  });

  it("forwards json_query so cached errors can be matched against new params on subsequent fetches (#32573)", async () => {
    const json_query = {
      database: 1,
      type: "query",
      query: { "source-table": 1 },
      parameters: [
        {
          id: "abc",
          type: "id",
          value: [42],
          target: [
            "dimension",
            ["field", "DOES_NOT_EXIST", { "base-type": "type/Integer" }],
          ],
        },
      ],
    };
    const body = buildCardQueryBatchNdjson(
      [{ id: 3, card_id: 4 }],
      createMockDataset(),
      new Map([[3, { error: "boom", json_query }]]),
    );
    const restore = setupFetch(body);

    const onCardError = jest.fn();
    try {
      await streamBatchCardQuery(
        { url: "/api/dashboard/1/card-query-batch", method: "POST" },
        {
          onCardResult: jest.fn(),
          onCardError,
          onComplete: jest.fn(),
        },
      );
    } finally {
      restore();
    }

    const [, , dataset] = onCardError.mock.calls[0];
    expect(dataset.json_query).toEqual(json_query);
  });

  it("omits optional fields when the server does not send them", async () => {
    const body = buildCardQueryBatchNdjson(
      [{ id: 7, card_id: 9 }],
      createMockDataset(),
      new Map([[7, { error: "Card not found in dashboard" }]]),
    );
    const restore = setupFetch(body);

    const onCardError = jest.fn();
    try {
      await streamBatchCardQuery(
        { url: "/api/dashboard/1/card-query-batch", method: "POST" },
        {
          onCardResult: jest.fn(),
          onCardError,
          onComplete: jest.fn(),
        },
      );
    } finally {
      restore();
    }

    const [, , dataset] = onCardError.mock.calls[0];
    expect(dataset).toEqual({
      status: "failed",
      error: "Card not found in dashboard",
      data: { cols: [], rows: [] },
    });
  });
});
