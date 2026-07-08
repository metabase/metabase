const { uploadCsvToMb } = require("./csv-to-mb");

const ok = () => ({ ok: true });
const fail = status => ({ ok: false, status, statusText: "err", text: async () => "" });

const upload = (over = {}) =>
  uploadCsvToMb({
    baseUrl: "https://stats.example.com",
    tableId: 1,
    jsonData: [{ a: 1 }],
    retryDelayMs: 1,
    ...over,
  });

describe("uploadCsvToMb retries", () => {
  afterEach(() => {
    delete global.fetch;
  });

  it("retries transient server errors then succeeds", async () => {
    global.fetch = jest.fn().mockResolvedValueOnce(fail(503)).mockResolvedValueOnce(fail(500)).mockResolvedValueOnce(ok());

    await expect(upload({ retries: 2 })).resolves.toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it("retries network errors", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(ok());

    await expect(upload({ retries: 2 })).resolves.toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries and throws the last error", async () => {
    global.fetch = jest.fn().mockResolvedValue(fail(500));

    await expect(upload({ retries: 2 })).rejects.toThrow("Upload failed: 500");
    expect(global.fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it("does not retry a non-transient 4xx", async () => {
    global.fetch = jest.fn().mockResolvedValue(fail(400));

    await expect(upload({ retries: 2 })).rejects.toThrow("Upload failed: 400");
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
