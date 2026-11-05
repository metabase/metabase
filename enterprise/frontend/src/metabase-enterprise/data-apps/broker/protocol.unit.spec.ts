import { setBasename } from "metabase/utils/basename";

import {
  getBrokerableApiPath,
  isBrokerPortMessage,
  isBrokerResponseMessage,
  isBrokerableApiPath,
} from "./protocol";

describe("isBrokerResponseMessage", () => {
  it("accepts a response and a network error", () => {
    expect(
      isBrokerResponseMessage({
        id: 1,
        status: 200,
        statusText: "OK",
        headers: { "content-type": "application/json" },
        body: new ArrayBuffer(2),
      }),
    ).toBe(true);
    expect(
      isBrokerResponseMessage({
        id: 1,
        status: 204,
        statusText: "No Content",
        headers: {},
        body: null,
      }),
    ).toBe(true);
    expect(
      isBrokerResponseMessage({
        id: 1,
        networkError: "TypeError: Failed to fetch",
      }),
    ).toBe(true);
    expect(isBrokerResponseMessage({ id: 1, opaqueRedirect: true })).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isBrokerResponseMessage(null)).toBe(false);
    expect(isBrokerResponseMessage({ status: 200 })).toBe(false);
    expect(isBrokerResponseMessage({ id: "1", networkError: "x" })).toBe(false);
    expect(isBrokerResponseMessage({ id: 1, networkError: 1 })).toBe(false);
    expect(isBrokerResponseMessage({ id: 1, opaqueRedirect: false })).toBe(
      false,
    );
    expect(
      isBrokerResponseMessage({
        id: 1,
        status: 200,
        statusText: "OK",
        headers: { a: 1 },
        body: null,
      }),
    ).toBe(false);
    expect(
      isBrokerResponseMessage({
        id: 1,
        status: 200,
        statusText: "OK",
        headers: {},
        body: "text",
      }),
    ).toBe(false);
  });
});

describe("isBrokerableApiPath", () => {
  it("relays API paths", () => {
    expect(isBrokerableApiPath("/api")).toBe(true);
    expect(isBrokerableApiPath("/api/dataset")).toBe(true);
    expect(isBrokerableApiPath("/api/card/1/query")).toBe(true);
  });

  it("refuses paths no endpoint scope covers", () => {
    expect(isBrokerableApiPath("/auth/sso")).toBe(false);
    expect(isBrokerableApiPath("/app/dist/app-main.js")).toBe(false);
    expect(isBrokerableApiPath("/")).toBe(false);
  });

  it("refuses a path that merely starts with the same letters", () => {
    expect(isBrokerableApiPath("/apifoo")).toBe(false);
  });
});

describe("getBrokerableApiPath", () => {
  afterEach(() => setBasename(""));

  it("gives the API path under the basename", () => {
    setBasename("/analytics");

    expect(
      getBrokerableApiPath(new URL("https://x.test/analytics/api/card?y=1")),
    ).toBe("/api/card");
  });

  it("refuses an API path outside the basename, which belongs to another application", () => {
    setBasename("/analytics");

    expect(getBrokerableApiPath(new URL("https://x.test/api/card"))).toBeNull();
  });

  it("refuses a path that an extra slash would turn into another host", () => {
    expect(
      getBrokerableApiPath(new URL("https://x.test//evil.test/api/card")),
    ).toBeNull();
  });
});

describe("isBrokerPortMessage", () => {
  const request = {
    type: "request",
    id: 1,
    method: "GET",
    url: "https://x.test/api/card",
    headers: { accept: "application/json" },
    body: null,
    redirect: "follow",
  };

  it("accepts the requests and cancellations the iframe sends", () => {
    expect(isBrokerPortMessage(request)).toBe(true);
    expect(isBrokerPortMessage({ ...request, redirect: "error" })).toBe(true);
    expect(isBrokerPortMessage({ ...request, redirect: "manual" })).toBe(true);
    expect(isBrokerPortMessage({ ...request, body: new ArrayBuffer(1) })).toBe(
      true,
    );
    expect(isBrokerPortMessage({ type: "cancel", id: 1 })).toBe(true);
  });

  it("drops anything else from the app document, which may run code that escaped the sandbox", () => {
    expect(isBrokerPortMessage(null)).toBe(false);
    expect(isBrokerPortMessage({ ...request, id: "1" })).toBe(false);
    expect(isBrokerPortMessage({ ...request, url: 42 })).toBe(false);
    expect(isBrokerPortMessage({ ...request, headers: { accept: 1 } })).toBe(
      false,
    );
    expect(isBrokerPortMessage({ ...request, body: "text" })).toBe(false);
    expect(isBrokerPortMessage({ ...request, redirect: "sideways" })).toBe(
      false,
    );
    expect(isBrokerPortMessage({ ...request, type: "other" })).toBe(false);
  });
});
