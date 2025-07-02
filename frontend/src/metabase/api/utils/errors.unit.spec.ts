import { getErrorMessage } from "./errors";

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
