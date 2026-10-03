import { getErrorMessage, isEmailAlreadyInUse } from "./errors";

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

  it("should build a message from a malli param-validation payload's specific-errors (metabase#78092)", () => {
    const result = getErrorMessage({
      data: {
        "specific-errors": {
          source_tables: ["should have at least 1 elements, received: []"],
        },
        errors: {
          source_tables:
            "sequence with length >= 1 of A source table entry in the array format. Combines alias with table reference.",
        },
      },
    });
    expect(result).toEqual(
      "source_tables: should have at least 1 elements, received: []",
    );
  });

  it("should fall back to a malli param-validation payload's errors when specific-errors is absent", () => {
    const result = getErrorMessage({
      data: {
        errors: { source_tables: "must have at least 1 element" },
      },
    });
    expect(result).toEqual("source_tables: must have at least 1 element");
  });

  it("should return a default fallback message if payload is null", () => {
    const result = getErrorMessage(null);
    expect(result).toEqual("Something went wrong");
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
