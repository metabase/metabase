const { readFileSync } = require("node:fs");

const { readSpecPaths } = require("../../e2e/runner/read-spec-paths");

jest.mock("node:fs", () => ({ readFileSync: jest.fn() }));

describe("readSpecPaths", () => {
  it("should use the full suite when no paths file is provided", () => {
    expect(readSpecPaths("")).toBeNull();
    expect(readSpecPaths(undefined)).toBeNull();
  });

  it("should preserve an empty selection", () => {
    readFileSync.mockReturnValue("[]");

    expect(readSpecPaths("specs.json")).toEqual([]);
  });

  it("should preserve selected paths, including spaces and commas", () => {
    const files = ["e2e/test/a.cy.spec.js", "e2e/test/a folder/b,c.cy.spec.ts"];
    readFileSync.mockReturnValue(JSON.stringify(files));

    expect(readSpecPaths("specs.json")).toEqual(files);
  });

  it.each(["{", "null", '""', "{}", "[null]", '[""]'])(
    "should reject invalid spec paths: %s",
    (contents) => {
      readFileSync.mockReturnValue(contents);

      expect(() => readSpecPaths("specs.json")).toThrow();
    },
  );
});
