import { getSuggestedImportPath } from "../utils/get-suggested-import-path";

describe("CLI > getSuggestedImportPath", () => {
  it.each([
    // defaults to GENERATED_COMPONENTS_DEFAULT_PATH
    ["", "../components/metabase"],

    // user inputs
    [".", ".."],
    ["components/foo", "../components/foo"],
    ["components/foo/bar", "../components/foo/bar"],
    ["./src/components/bar", "../components/bar"],
    ["src/components/baz", "../components/baz"],
    ["modules/quux", "../modules/quux"],
    ["components", "../components"],
  ])("suggests a reasonable import path", (input, suggestion) => {
    expect(
      getSuggestedImportPath({
        isNextJs: false,
        isUsingSrcDirectory: true,
        componentPath: input,
      }),
    ).toBe(suggestion);
  });

  it("suggests a reasonable default import path for Next.js without src directory", () => {
    expect(
      getSuggestedImportPath({ isNextJs: true, isUsingSrcDirectory: false }),
    ).toBe("../components/metabase");

    expect(
      getSuggestedImportPath({
        isNextJs: true,
        isUsingSrcDirectory: false,
        componentPath: "foo/bar",
      }),
    ).toBe("../foo/bar");
  });

  it("suggests a reasonable default import path for Next.js with src directory", () => {
    expect(
      getSuggestedImportPath({ isNextJs: true, isUsingSrcDirectory: true }),
    ).toBe("./metabase");

    expect(
      getSuggestedImportPath({
        isNextJs: true,
        isUsingSrcDirectory: true,
        componentPath: "foo/bar",
      }),
    ).toBe("./bar");
  });
});
