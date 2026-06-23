import { StreamInterruptedError } from "./errors";
import { handleResponse, substituteUrlTags } from "./utils";

type MockResponseOptions = {
  ok?: boolean;
  status?: number;
  contentType?: string | null;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

const mockResponse = ({
  ok = true,
  status = 200,
  contentType = "application/json",
  json = () => Promise.resolve({}),
  text = () => Promise.resolve(""),
}: MockResponseOptions): Response =>
  ({
    ok,
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "content-type" ? contentType : null,
    },
    json,
    text,
  }) as unknown as Response;

describe("handleResponse", () => {
  it("parses a successful JSON body", async () => {
    const body = { id: 1 };
    const result = await handleResponse(
      mockResponse({ json: () => Promise.resolve(body) }),
    );
    expect(result).toEqual({ ok: true, status: 200, body });
  });

  it("returns a null body for an empty 204", async () => {
    const result = await handleResponse(
      mockResponse({ status: 204, contentType: null }),
    );
    expect(result).toEqual({ ok: true, status: 204, body: null });
  });

  it("reads a non-JSON body as text", async () => {
    const result = await handleResponse(
      mockResponse({
        contentType: "text/csv",
        text: () => Promise.resolve("a,b"),
      }),
    );
    expect(result).toEqual({ ok: true, status: 200, body: "a,b" });
  });

  it("parses a non-ok JSON error body", async () => {
    const body = { message: "boom" };
    const result = await handleResponse(
      mockResponse({
        ok: false,
        status: 400,
        json: () => Promise.resolve(body),
      }),
    );
    expect(result).toEqual({ ok: false, status: 400, body });
  });

  it("swallows an unparseable error body to null rather than throwing", async () => {
    const result = await handleResponse(
      mockResponse({
        ok: false,
        status: 500,
        json: () =>
          Promise.reject(new SyntaxError("Unexpected end of JSON input")),
      }),
    );
    expect(result).toEqual({ ok: false, status: 500, body: null });
  });

  // The dropped 202 special-casing: a streamed success whose body fails to read
  // (the server aborted the connection mid-stream) must reject, not resolve — that
  // rejection is how the truncated response surfaces as an error. A mid-stream
  // abort rejects the read with a TypeError, which becomes a typed
  // StreamInterruptedError so the UI doesn't misread it as a connectivity failure.
  it("rejects with a StreamInterruptedError when a body fails to read mid-stream", async () => {
    await expect(
      handleResponse(
        mockResponse({
          status: 202,
          json: () => Promise.reject(new TypeError("network error")),
        }),
      ),
    ).rejects.toBeInstanceOf(StreamInterruptedError);
  });

  // A complete-but-malformed JSON body is a parse problem, not a stream abort —
  // it must NOT be reclassified as a StreamInterruptedError.
  it("lets a SyntaxError from a malformed JSON body propagate unchanged", async () => {
    const syntaxError = new SyntaxError("Unexpected token");
    await expect(
      handleResponse(mockResponse({ json: () => Promise.reject(syntaxError) })),
    ).rejects.toBe(syntaxError);
  });

  describe("rawResponse", () => {
    it("returns the untouched Response as the body on success without reading it", async () => {
      const json = jest.fn();
      const text = jest.fn();
      const response = mockResponse({ json, text });

      const result = await handleResponse(response, true);

      expect(result).toEqual({ ok: true, status: 200, body: response });
      expect(json).not.toHaveBeenCalled();
      expect(text).not.toHaveBeenCalled();
    });

    it("falls through to read the body as error data on failure", async () => {
      const body = { message: "nope" };
      const result = await handleResponse(
        mockResponse({
          ok: false,
          status: 403,
          json: () => Promise.resolve(body),
        }),
        true,
      );
      expect(result).toEqual({ ok: false, status: 403, body });
    });
  });
});

describe("substituteUrlTags", () => {
  it("returns the URL unchanged when no tags are present", () => {
    const data = { extra: 1 };
    const url = substituteUrlTags("/api/foo", data);
    expect(url).toBe("/api/foo");
    expect(data).toEqual({ extra: 1 });
  });

  it("substitutes a single :tag and consumes it from data", () => {
    const data = { id: 42, leftover: "x" };
    const url = substituteUrlTags("/api/foo/:id", data);
    expect(url).toBe("/api/foo/42");
    expect(data).toEqual({ leftover: "x" });
  });

  it("substitutes multiple :tags in one URL", () => {
    const data = { dashId: 1, paramId: "p" };
    const url = substituteUrlTags(
      "/api/dashboard/:dashId/params/:paramId/values",
      data,
    );
    expect(url).toBe("/api/dashboard/1/params/p/values");
    expect(data).toEqual({});
  });

  it("URL-encodes :tag values by default", () => {
    const data = { id: "a/b c" };
    const url = substituteUrlTags("/api/foo/:id", data);
    expect(url).toBe("/api/foo/a%2Fb%20c");
  });

  it("substitutes empty string and warns when a tag has no value in data", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const data = {};
    const url = substituteUrlTags("/api/foo/:missing", data);
    expect(url).toBe("/api/foo/");
    expect(warn).toHaveBeenCalledWith(
      "Warning: calling",
      "/api/foo/:missing",
      "without",
      ":missing",
    );
    warn.mockRestore();
  });

  it("coerces non-string values to strings before encoding", () => {
    const data = { id: 7, flag: true };
    const url = substituteUrlTags("/api/:id/:flag", data);
    expect(url).toBe("/api/7/true");
  });

  it("falls back to a body field when the tag is absent from data (embed :token)", () => {
    const data = {};
    const body = { token: "THE_JWT", parameters: "[]" };
    const url = substituteUrlTags("/api/embed/card/:token/query", data, body);
    expect(url).toBe("/api/embed/card/THE_JWT/query");
    // consumed from the body, leaving the other body field intact
    expect(body).toEqual({ parameters: "[]" });
    expect(data).toEqual({});
  });

  it("prefers a data value over a body value for the same tag", () => {
    const data = { id: "from-data" };
    const body = { id: "from-body" };
    const url = substituteUrlTags("/api/foo/:id", data, body);
    expect(url).toBe("/api/foo/from-data");
    expect(data).toEqual({});
    // the body value is left untouched since data satisfied the tag
    expect(body).toEqual({ id: "from-body" });
  });
});
