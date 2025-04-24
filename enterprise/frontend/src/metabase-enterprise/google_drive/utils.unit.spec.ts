import { getErrorMessage, getStatus } from "./utils";

describe("google_drive > getStatus", () => {
  it("should return 'not-connected' if status is undefined", () => {
    const result = getStatus({ status: undefined, error: undefined });
    expect(result).toEqual("not-connected");
  });

  it("should return 'not-connected' if status is an empty string", () => {
    // @ts-expect-error - testing invalid case
    const result = getStatus({ status: "", error: undefined });
    expect(result).toEqual("not-connected");
  });

  it("should return 'not-connected' if status is null", () => {
    const result = getStatus({ status: null, error: undefined });
    expect(result).toEqual("not-connected");
  });

  it("should return 'error' if error is truthy", () => {
    // @ts-expect-error - testing invalid case
    const result = getStatus({ status: "some-status", error: new Error() });
    expect(result).toEqual("error");
  });

  it("should return 'error' if status is status is error", () => {
    const result = getStatus({ status: "error" });
    expect(result).toEqual("error");
  });

  it("should return 'syncing' if status is status is syncing", () => {
    const result = getStatus({ status: "syncing" });
    expect(result).toEqual("syncing");
  });

  it("should return 'active' if status is status is active", () => {
    const result = getStatus({ status: "active" });
    expect(result).toEqual("active");
  });

  it("should return 'not-connected' if status is status is not-connected", () => {
    const result = getStatus({ status: "not-connected" });
    expect(result).toEqual("not-connected");
  });

  it("should return the status if status is an invalid non-empty string", () => {
    // @ts-expect-error - testing invalid case
    const result = getStatus({ status: "some-status", error: undefined });
    expect(result).toEqual("some-status");
  });

  describe("getErrorMessage", () => {
    it("should return a message from a string payload", () => {
      const result = getErrorMessage("Some error message");
      expect(result).toEqual("Some error message");
    });

    it("should return a message from an object payload with a message property", () => {
      const result = getErrorMessage({ message: "Some error message" });
      expect(result).toEqual("Some error message");
    });

    it("should return a message from an object payload with an error_message property", () => {
      const result = getErrorMessage({ error_message: "Some error message" });
      expect(result).toEqual("Some error message");
    });

    it("should return a message from a data.message property", () => {
      const result = getErrorMessage({
        data: { message: "Some error message" },
      });
      expect(result).toEqual("Some error message");
    });

    it("should return a message from data.error_message", () => {
      const result = getErrorMessage({
        data: { error_message: "Some error message" },
      });
      expect(result).toEqual("Some error message");
    });

    it("should return a message from an object payload with a data property containing a string", () => {
      const result = getErrorMessage({ data: "Some error message" });
      expect(result).toEqual("Some error message");
    });

    it("should return a fallback message if no message is found", () => {
      const result = getErrorMessage(
        { data: { not_message: "some message" } },
        "Fallback message",
      );
      expect(result).toEqual("Fallback message");
    });

    it("should return a fallback message if payload is null", () => {
      const result = getErrorMessage(null, "Fallback message");
      expect(result).toEqual("Fallback message");
    });

    it("should return a default fallback message if payload is null", () => {
      const result = getErrorMessage(null);
      expect(result).toEqual("Something went wrong");
    });
  });
});
