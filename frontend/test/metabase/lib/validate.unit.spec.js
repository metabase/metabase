import validate, { validators } from "metabase/lib/validate";

describe("validators", () => {
  describe("required", () => {
    it("should return an error if the value is null", () => {
      expect(validators.required()(null)).toBe("required");
    });
    it("should return an error if the value is undefined", () => {
      expect(validators.required()(undefined)).toBe("required");
    });
    it("should return an error if the value is an empty string", () => {
      expect(validators.required()("")).toBe("required");
    });
    it("should return an error if the value is a non-empty string", () => {
      expect(validators.required()("asdf")).toBeFalsy();
    });
    xit("should return an error if the value is a number", () => {
      expect(validators.required()(0)).toBeFalsy();
    });
  });
});

describe("validate", () => {
  it("should have the validators as methods", () => {
    expect(validate.required()()).toBe("required");
  });
  it("should return chainable validators that returns the first error by default", () => {
    expect(validate.required().email()()).toBe("required");
    expect(validate.required().email()("asdf")).toBe(
      "must be a valid email address",
    );
  });
  describe("all", () => {
    expect(validate.required().email().all()()).toEqual([
      "required",
      "must be a valid email address",
    ]);
  });
});
