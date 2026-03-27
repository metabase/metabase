import {
  _resetForTesting,
  getTraceparentHeader,
  initTracing,
  rotateTraceId,
} from "metabase/lib/otel";

// W3C traceparent: 00-{32 hex}-{16 hex}-01
const TRACEPARENT_REGEX = /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/;

describe("otel", () => {
  beforeEach(() => {
    _resetForTesting();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("getTraceparentHeader", () => {
    it("returns null before initialization", () => {
      expect(getTraceparentHeader()).toBeNull();
    });

    it("returns a valid W3C traceparent after init", () => {
      initTracing();
      const header = getTraceparentHeader();
      expect(header).toMatch(TRACEPARENT_REGEX);
    });

    it("returns the same trace ID for consecutive calls within idle timeout", () => {
      initTracing();
      const header1 = getTraceparentHeader()!;
      const header2 = getTraceparentHeader()!;

      const traceId1 = header1.split("-")[1];
      const traceId2 = header2.split("-")[1];
      expect(traceId1).toBe(traceId2);
    });

    it("generates unique span IDs for each call", () => {
      initTracing();
      const header1 = getTraceparentHeader()!;
      const header2 = getTraceparentHeader()!;

      const spanId1 = header1.split("-")[2];
      const spanId2 = header2.split("-")[2];
      expect(spanId1).not.toBe(spanId2);
    });
  });

  describe("rotateTraceId", () => {
    it("changes the trace ID immediately", () => {
      initTracing();
      const before = getTraceparentHeader()!.split("-")[1];
      rotateTraceId();
      const after = getTraceparentHeader()!.split("-")[1];

      expect(before).not.toBe(after);
    });

    it("is a no-op when tracing is not initialized", () => {
      rotateTraceId();
      expect(getTraceparentHeader()).toBeNull();
    });
  });

  describe("idle timeout", () => {
    it("rotates trace ID after idle period expires", () => {
      initTracing();
      const first = getTraceparentHeader()!.split("-")[1];

      // Advance past the 5s idle timeout
      jest.advanceTimersByTime(6000);

      const second = getTraceparentHeader()!.split("-")[1];
      expect(first).not.toBe(second);
    });

    it("keeps the same trace ID if requests happen within idle window", () => {
      initTracing();
      const first = getTraceparentHeader()!.split("-")[1];

      // Make a request at 3s (resets the timer)
      jest.advanceTimersByTime(3000);
      const second = getTraceparentHeader()!.split("-")[1];
      expect(first).toBe(second);

      // Make another at 3s later (6s total, but only 3s since last call)
      jest.advanceTimersByTime(3000);
      const third = getTraceparentHeader()!.split("-")[1];
      expect(first).toBe(third);
    });

    it("rotates after idle even without route change", () => {
      initTracing();
      const first = getTraceparentHeader()!.split("-")[1];

      // Simulate user inactivity then a new action
      jest.advanceTimersByTime(6000);
      const second = getTraceparentHeader()!.split("-")[1];

      jest.advanceTimersByTime(6000);
      const third = getTraceparentHeader()!.split("-")[1];

      expect(first).not.toBe(second);
      expect(second).not.toBe(third);
    });
  });

  describe("traceparent format", () => {
    it("has version 00", () => {
      initTracing();
      const header = getTraceparentHeader()!;
      expect(header.startsWith("00-")).toBe(true);
    });

    it("has trace-flags 01 (sampled)", () => {
      initTracing();
      const header = getTraceparentHeader()!;
      expect(header.endsWith("-01")).toBe(true);
    });

    it("has a 32-char trace ID and 16-char span ID", () => {
      initTracing();
      const parts = getTraceparentHeader()!.split("-");
      expect(parts).toHaveLength(4);
      expect(parts[1]).toHaveLength(32);
      expect(parts[2]).toHaveLength(16);
    });
  });
});
