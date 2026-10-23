import { describeError } from "./describe-error";

const setup = (value: unknown, fallbackMessage?: string) => {
  return { result: describeError(value, fallbackMessage) };
};

describe("describeError", () => {
  it("pulls message and stack out of a real Error", () => {
    const error = new Error("boom");
    error.stack = "boom\n  at foo";

    const { result } = setup(error);

    expect(result).toEqual({ message: "boom", stack: "boom\n  at foo" });
  });

  it("reads message/stack off a plain error-shaped object", () => {
    const { result } = setup({ message: "nope", stack: "trace" });

    expect(result).toEqual({ message: "nope", stack: "trace" });
  });

  it("falls back when the message is missing or not a string", () => {
    expect(setup({ message: 42 }).result).toEqual({
      message: "An unexpected error occurred.",
      stack: undefined,
    });
    expect(setup(null).result).toEqual({
      message: "An unexpected error occurred.",
      stack: undefined,
    });
  });

  it("uses the caller-provided fallback message", () => {
    const { result } = setup(undefined, "could not load");

    expect(result).toEqual({ message: "could not load", stack: undefined });
  });

  it("omits stack when it isn't a string", () => {
    const { result } = setup({ message: "m", stack: { not: "a string" } });

    expect(result).toEqual({ message: "m", stack: undefined });
  });

  it("returns the fallback when reading across a membrane-opaque proxy throws", () => {
    // Mimics a Near-Membrane guest-realm value: touching any property throws in
    // the host realm. `describeError` must swallow that and return the fallback.
    const opaque = new Proxy(
      {},
      {
        get() {
          throw new Error("membrane access denied");
        },
      },
    );

    expect(setup(opaque, "opaque").result).toEqual({ message: "opaque" });
  });
});
