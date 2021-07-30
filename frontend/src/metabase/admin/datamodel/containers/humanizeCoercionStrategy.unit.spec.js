import { humanizeCoercionStrategy } from "./humanizeCoercionStrategy";

it("does not convert `Don't cast`", () => {
  const original = "Don't cast";
  const humanized = humanizeCoercionStrategy(original);

  expect(humanized).toBe(original);
});

describe("ISO 8601", () => {
  it("converts to ISO 8601 → Time", () => {
    const original = "ISO8601->Time";
    const expected = "ISO 8601 → Time";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to ISO 8601 → Date", () => {
    const original = "ISO8601->Date";
    const expected = "ISO 8601 → Date";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to ISO 8601 → Datetime", () => {
    const original = "ISO8601->DateTime";
    const expected = "ISO 8601 → Datetime";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });
});

describe("UNIX seconds", () => {
  it("converts to UNIX seconds → Time", () => {
    const original = "UNIXSeconds->Time";
    const expected = "UNIX seconds → Time";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to UNIX seconds → Date", () => {
    const original = "UNIXSeconds->Date";
    const expected = "UNIX seconds → Date";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to UNIX seconds → Datetime", () => {
    const original = "UNIXSeconds->DateTime";
    const expected = "UNIX seconds → Datetime";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });
});

describe("UNIX milliseconds", () => {
  it("converts to UNIX milliseconds → Time", () => {
    const original = "UNIXMilliSeconds->Time";
    const expected = "UNIX milliseconds → Time";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to UNIX milliseconds → Date", () => {
    const original = "UNIXMilliSeconds->Date";
    const expected = "UNIX milliseconds → Date";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to UNIX milliseconds → Datetime", () => {
    const original = "UNIXMilliSeconds->DateTime";
    const expected = "UNIX milliseconds → Datetime";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });
});

describe("UNIX microseconds", () => {
  it("converts to UNIX microseconds → Time", () => {
    const original = "UNIXMicroSeconds->Time";
    const expected = "UNIX microseconds → Time";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to UNIX microseconds → Date", () => {
    const original = "UNIXMicroSeconds->Date";
    const expected = "UNIX microseconds → Date";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts to UNIX microseconds → Datetime", () => {
    const original = "UNIXMicroSeconds->DateTime";
    const expected = "UNIX microseconds → Datetime";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });
});

describe("YYYYMMDDHHMMSS", () => {
  it("converts YYYYMMDDHHMMSSString->Temporal to YYYYMMDDHHMMSS → Time", () => {
    const original = "YYYYMMDDHHMMSSString->Temporal";
    const expected = "YYYYMMDDHHMMSS string → Temporal";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });

  it("converts YYYYMMDDHHMMSSBytes->Temporal to YYYYMMDDHHMMSS → Time", () => {
    const original = "YYYYMMDDHHMMSSBytes->Temporal";
    const expected = "YYYYMMDDHHMMSS bytes → Temporal";

    const humanized = humanizeCoercionStrategy(original);

    expect(humanized).toBe(expected);
  });
});
