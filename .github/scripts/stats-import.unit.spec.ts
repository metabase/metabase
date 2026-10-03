import { importStats } from "./stats-import";

const ok = (body: unknown = { inserted: 1 }) => ({ ok: true, json: async () => body });
const fail = (status: number) => ({
  ok: false,
  status,
  statusText: "err",
  text: async () => "",
});

const load = (over: Record<string, unknown> = {}) =>
  importStats({
    baseUrl: "https://stats.example.com",
    table: "emotion_files",
    rows: [{ a: 1 }],
    retryDelayMs: 1,
    ...over,
  });

describe("importStats requests", () => {
  afterEach(() => {
    // @ts-expect-error -- removing the stub the tests installed
    delete global.fetch;
    delete process.env.API_KEY;
    delete process.env.ENG_STATS_URL;
  });

  it("defaults the origin to ENG_STATS_URL", async () => {
    const fetchMock = jest.fn().mockResolvedValue(ok());
    global.fetch = fetchMock;
    process.env.ENG_STATS_URL = "https://importer.example.com";

    await load({ baseUrl: undefined });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://importer.example.com/api/import/emotion_files",
    );
  });

  it("tolerates a trailing slash on the origin", async () => {
    const fetchMock = jest.fn().mockResolvedValue(ok());
    global.fetch = fetchMock;

    await load({ baseUrl: "https://importer.example.com/" });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://importer.example.com/api/import/emotion_files",
    );
  });

  it("fails loudly when no origin is configured", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(load({ baseUrl: undefined })).rejects.toThrow("ENG_STATS_URL is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("PUTs the rows as JSON to the table's import endpoint", async () => {
    const fetchMock = jest.fn().mockResolvedValue(ok());
    global.fetch = fetchMock;
    process.env.API_KEY = "secret";

    await expect(load({ rows: [{ a: 1 }, { a: 2 }] })).resolves.toEqual({
      success: true,
      inserted: 1,
      ignoredKeys: undefined,
    });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://stats.example.com/api/import/emotion_files");
    expect(options.method).toBe("PUT");
    expect(options.headers).toMatchObject({
      "x-api-key": "secret",
      "content-type": "application/json",
    });
    expect(JSON.parse(options.body)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("skips the request entirely when there are no rows", async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(load({ rows: [] })).resolves.toEqual({ success: true, inserted: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("succeeds even if the response body does not parse", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(load()).resolves.toMatchObject({ success: true });
  });
});

describe("importStats retries", () => {
  afterEach(() => {
    // @ts-expect-error -- removing the stub the tests installed
    delete global.fetch;
  });

  it("retries transient server errors then succeeds", async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(fail(503))
      .mockResolvedValueOnce(fail(500))
      .mockResolvedValueOnce(ok());
    global.fetch = fetchMock;

    await expect(load({ retries: 2 })).resolves.toMatchObject({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries throttling", async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce(fail(429)).mockResolvedValueOnce(ok());
    global.fetch = fetchMock;

    await expect(load({ retries: 2 })).resolves.toMatchObject({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries network errors", async () => {
    const fetchMock = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(ok());
    global.fetch = fetchMock;

    await expect(load({ retries: 2 })).resolves.toMatchObject({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries and throws the last error", async () => {
    const fetchMock = jest.fn().mockResolvedValue(fail(500));
    global.fetch = fetchMock;

    await expect(load({ retries: 2 })).rejects.toThrow("Import failed: 500");
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry a non-transient 4xx", async () => {
    const fetchMock = jest.fn().mockResolvedValue(fail(400));
    global.fetch = fetchMock;

    await expect(load({ retries: 2 })).rejects.toThrow("Import failed: 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry an unknown table", async () => {
    const fetchMock = jest.fn().mockResolvedValue(fail(404));
    global.fetch = fetchMock;

    await expect(load({ retries: 2 })).rejects.toThrow("Import failed: 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
