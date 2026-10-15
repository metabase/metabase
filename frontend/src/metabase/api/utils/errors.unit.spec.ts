import {
  findErrorMessage,
  getErrorMessage,
  isEmailAlreadyInUse,
} from "./errors";

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

  it("should return the whole-form message under errors._error", () => {
    const result = getErrorMessage({
      data: { errors: { _error: "Invalid credentials" } },
    });
    expect(result).toEqual("Invalid credentials");
  });

  it("should not use a field-level validation message as the error message", () => {
    const result = getErrorMessage(
      { data: { errors: { password: "too short" } } },
      "Fallback message",
    );
    expect(result).toEqual("Fallback message");
  });

  it("should return the first message in a list of errors", () => {
    const result = getErrorMessage({
      errors: [{ error: "First failure" }, { message: "Second failure" }],
    });
    expect(result).toEqual("First failure");
  });

  it("should prefer the message in a structured body over the error's own message", () => {
    const result = getErrorMessage({
      message: "Request failed",
      data: { message: "Server message" },
    });
    expect(result).toEqual("Server message");
  });

  it("should prefer the error's own message over a plain-string body", () => {
    const result = getErrorMessage({
      message: "Request failed",
      data: "Server message",
    });
    expect(result).toEqual("Request failed");
  });

  it("should prefer a whole-form message in the body over the error's own message", () => {
    const result = getErrorMessage({
      message: "Request failed",
      data: { errors: { _error: "Invalid credentials" } },
    });
    expect(result).toEqual("Invalid credentials");
  });

  it("should fall back to the error's own message when the body is empty", () => {
    const result = getErrorMessage({ message: "Request failed", data: {} });
    expect(result).toEqual("Request failed");
  });

  it("should return the cause of an error", () => {
    const result = getErrorMessage({ cause: "Root cause" });
    expect(result).toEqual("Root cause");
  });

  it("should look inside a nested error wrapper", () => {
    const result = getErrorMessage({
      error: { status: 400, data: "Nested message" },
    });
    expect(result).toEqual("Nested message");
  });
});

describe("findErrorMessage", () => {
  it("should return undefined when the error carries no message", () => {
    expect(findErrorMessage({ status: 500 })).toBeUndefined();
    expect(findErrorMessage("")).toBeUndefined();
    expect(findErrorMessage(undefined)).toBeUndefined();
  });

  it("should return the message of a thrown Error", () => {
    expect(findErrorMessage(new Error("Boom"))).toEqual("Boom");
  });
});

describe("isEmailAlreadyInUse", () => {
  it("flags only a body carrying the email-already-in-use error_code", () => {
    expect(
      isEmailAlreadyInUse({
        status: 400,
        data: { error_code: "email-already-in-use" },
      }),
    ).toBe(true);
    expect(
      isEmailAlreadyInUse({ status: 400, data: { error_code: "archived" } }),
    ).toBe(false);
    expect(isEmailAlreadyInUse({ status: 400, data: {} })).toBe(false);
    expect(isEmailAlreadyInUse(undefined)).toBe(false);
  });
});
