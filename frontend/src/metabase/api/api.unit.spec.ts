import type { BaseQueryApi } from "@reduxjs/toolkit/query/react";

import { api } from "metabase/api/client";

import { baseQuery } from "./api";

describe("baseQuery (RTK Query adapter)", () => {
  const ctx = { signal: new AbortController().signal } as BaseQueryApi;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // GET/POST retried on transient 503s on the legacy client, and the baseQuery
  // must keep opting them in; PUT/DELETE never retried and must stay off.
  it.each([
    { method: "GET", retry: true },
    { method: "POST", retry: true },
    { method: "PUT", retry: false },
    { method: "DELETE", retry: false },
  ])("passes retry=$retry for $method", async ({ method, retry }) => {
    const requestSpy = jest.spyOn(api, "request").mockResolvedValue({});

    await baseQuery({ method, url: "/api/thing" }, ctx, {});

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ method, retry }),
    );
  });

  it("defaults a bare-string arg to a retriable GET", async () => {
    const requestSpy = jest.spyOn(api, "request").mockResolvedValue({});

    await baseQuery("/api/thing", ctx, {});

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "/api/thing",
        method: "GET",
        retry: true,
      }),
    );
  });

  it("forwards the lifecycle abort signal to the client", async () => {
    const requestSpy = jest.spyOn(api, "request").mockResolvedValue({});

    await baseQuery({ method: "GET", url: "/api/thing" }, ctx, {});

    expect(requestSpy).toHaveBeenCalledWith(
      expect.objectContaining({ signal: ctx.signal }),
    );
  });

  it("returns the resolved value under `data`", async () => {
    jest.spyOn(api, "request").mockResolvedValue({ id: 1 });

    const result = await baseQuery(
      { method: "GET", url: "/api/thing" },
      ctx,
      {},
    );

    expect(result).toEqual({ data: { id: 1 } });
  });

  it("returns a thrown failure under `error`", async () => {
    const failure = { status: 500, data: "boom" };
    jest.spyOn(api, "request").mockRejectedValue(failure);

    const result = await baseQuery(
      { method: "GET", url: "/api/thing" },
      ctx,
      {},
    );

    expect(result).toEqual({ error: failure });
  });
});
