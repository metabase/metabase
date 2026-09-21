import { toActionExecuteError } from "./to-action-execute-error";

describe("toActionExecuteError", () => {
  describe("HTTP-shaped input (api.request throw)", () => {
    it("normalizes a typical 4xx response", () => {
      const result = toActionExecuteError({
        status: 403,
        data: { message: "denied" },
        isCancelled: false,
      });

      expect(result).toEqual({
        status: 403,
        data: { message: "denied" },
        isCancelled: false,
      });
    });

    it("preserves a 5xx status", () => {
      const result = toActionExecuteError({
        status: 500,
        data: { message: "internal" },
        isCancelled: false,
      });

      expect(result.status).toBe(500);
    });

    it("passes through the per-field `errors` map but drops internal fields (via / cause / trace)", () => {
      const result = toActionExecuteError({
        status: 400,
        data: {
          message: "bad input",
          errors: { discount: "must be positive" },
          via: [{ type: ":db-error" }],
          cause: { foo: "bar" },
          trace: ["frame-1", "frame-2"],
        },
        isCancelled: false,
        // an unrelated top-level field a future api.request could add
        diagnostic: "raw",
      });

      expect(result).toEqual({
        status: 400,
        data: {
          message: "bad input",
          errors: { discount: "must be positive" },
        },
        isCancelled: false,
      });
      expect(result.data).not.toHaveProperty("via");
      expect(result.data).not.toHaveProperty("cause");
      expect(result.data).not.toHaveProperty("trace");
      expect(result).not.toHaveProperty("diagnostic");
    });

    it("extracts the message from a raw driver error (via / trace / cause / nested data dropped)", () => {
      const sqlMessage =
        'Value too long for column "STATE CHARACTER(2)": "\'dasddasd\' (8)"; SQL statement:\n' +
        'INSERT INTO "PUBLIC"."PEOPLE" ("STATE", "NAME", "EMAIL") VALUES (CAST(? AS VARCHAR), CAST(? AS VARCHAR), CAST(? AS VARCHAR)) [22001-214]';

      const result = toActionExecuteError({
        status: 400,
        data: {
          via: [{ type: "clojure.lang.ExceptionInfo", message: sqlMessage }],
          trace: [
            ["metabase.driver.sql_jdbc.actions", "invoke", "actions.clj", 71],
          ],
          cause: sqlMessage,
          data: { message: sqlMessage, "status-code": 400 },
          message: sqlMessage,
        },
      });

      // message preserved verbatim (incl. the SQL statement + newline); no errors key
      expect(result).toEqual({
        status: 400,
        data: { message: sqlMessage },
        isCancelled: false,
      });
      expect(result.data).not.toHaveProperty("via");
      expect(result.data).not.toHaveProperty("trace");
      expect(result.data).not.toHaveProperty("cause");
      expect(result.data).not.toHaveProperty("errors");
      // the nested internal `data` block must not leak through
      expect(result.data).not.toHaveProperty("status-code");
    });

    it("surfaces a whole-request failure with an empty `errors` map (e.g. FK constraint)", () => {
      const result = toActionExecuteError({
        status: 400,
        data: {
          message: "Other rows refer to this row so it cannot be deleted.",
          errors: {},
        },
        isCancelled: false,
      });

      expect(result).toEqual({
        status: 400,
        data: {
          message: "Other rows refer to this row so it cannot be deleted.",
          errors: {},
        },
        isCancelled: false,
      });
    });

    it("keeps `errors` even when there is no string message", () => {
      const result = toActionExecuteError({
        status: 403,
        data: { errors: { id: "required" } },
        isCancelled: false,
      });

      expect(result).toEqual({
        status: 403,
        data: { message: undefined, errors: { id: "required" } },
        isCancelled: false,
      });
    });

    it("omits `errors` when the body has none", () => {
      const result = toActionExecuteError({
        status: 403,
        data: { message: "denied" },
        isCancelled: false,
      });

      expect(result.data).not.toHaveProperty("errors");
    });

    it("ignores a non-object `errors` value", () => {
      const result = toActionExecuteError({
        status: 400,
        data: { message: "x", errors: "not-a-map" },
        isCancelled: false,
      });

      expect(result.data).not.toHaveProperty("errors");
    });

    it("coerces a truthy isCancelled to true", () => {
      const result = toActionExecuteError({
        status: 0,
        data: { message: "aborted" },
        isCancelled: 1,
      });

      expect(result.isCancelled).toBe(true);
    });

    it("defaults missing isCancelled to false", () => {
      const result = toActionExecuteError({
        status: 500,
        data: { message: "x" },
      });

      expect(result.isCancelled).toBe(false);
    });
  });

  describe("non-HTTP input (transport / unknown)", () => {
    it("normalizes a native Error using its message and omits status", () => {
      const result = toActionExecuteError(new Error("boom"));

      expect(result).toEqual({
        data: { message: "boom" },
        isCancelled: false,
      });
      expect(result.status).toBeUndefined();
    });

    it("normalizes a string by using it as the message", () => {
      const result = toActionExecuteError("oops");

      expect(result).toEqual({
        data: { message: "oops" },
        isCancelled: false,
      });
    });

    it("normalizes null with a 'null' message", () => {
      const result = toActionExecuteError(null);

      expect(result).toEqual({
        data: { message: "null" },
        isCancelled: false,
      });
    });

    it("normalizes undefined with an 'undefined' message", () => {
      const result = toActionExecuteError(undefined);

      expect(result).toEqual({
        data: { message: "undefined" },
        isCancelled: false,
      });
    });

    it("falls back when status is non-numeric (e.g. stringly-typed)", () => {
      const result = toActionExecuteError({
        status: "403",
        data: { message: "denied" },
      });

      // Non-numeric status → treated as unknown shape, no status emitted.
      expect(result.status).toBeUndefined();
      expect(result.data.message).toBe("[object Object]");
    });

    it("falls back when there is no status field at all", () => {
      const result = toActionExecuteError({
        data: { message: "denied" },
      });

      expect(result.status).toBeUndefined();
    });

    it("marks AbortError-shaped errors as cancelled", () => {
      const abort = Object.assign(new Error("Aborted"), {
        name: "AbortError" as const,
      });

      const result = toActionExecuteError(abort);

      expect(result.isCancelled).toBe(true);
      expect(result.data.message).toBe("Aborted");
    });

    it("marks a DOMException AbortError as cancelled", () => {
      const result = toActionExecuteError(
        new DOMException("Aborted", "AbortError"),
      );

      expect(result.isCancelled).toBe(true);
    });
  });

  describe("plain-string body", () => {
    it("uses the body string as the message when data is a string", () => {
      const result = toActionExecuteError({
        status: 404,
        data: "Not found.",
      });

      expect(result).toEqual({
        status: 404,
        data: { message: "Not found." },
        isCancelled: false,
      });
    });
  });

  it("never leaks the original reference — output is always a fresh object", () => {
    const input = {
      status: 400,
      data: { message: "x" },
      isCancelled: false,
    };

    const result = toActionExecuteError(input);

    expect(result).not.toBe(input);
    expect(result.data).not.toBe(input.data);
  });
});
