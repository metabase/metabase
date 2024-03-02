import MetabaseSettings from "metabase/lib/settings";

import { generatePassword } from "./security";

describe("generatePassword", () => {
  it("defaults to at least 14 characters even if password-complexity requirements are lower", () => {
    MetabaseSettings.set("password-complexity", { total: 10 });
    expect(generatePassword().length).toBe(14);
  });

  it("defaults to complexity requirements if greater than 14", () => {
    MetabaseSettings.set("password-complexity", { total: 20 });
    expect(generatePassword().length).toBe(20);
  });

  it("falls back to length 14 passwords", () => {
    expect(generatePassword({}).length).toBe(14);
  });

  it("creates passwords for the length we specify", () => {
    expect(generatePassword({ total: 25 }).length).toBe(25);
  });

  it("can enforce", () => {
    expect(
      generatePassword({ total: 14, digit: 2 }).match(/([\d])/g).length >= 2,
    ).toBe(true);
  });

  it("can enforce digit requirements", () => {
    expect(
      generatePassword({ total: 14, digit: 2 }).match(/([\d])/g).length >= 2,
    ).toBe(true);
  });

  it("can enforce uppercase requirements", () => {
    expect(
      generatePassword({ total: 14, upper: 2 }).match(/([A-Z])/g).length >= 2,
    ).toBe(true);
  });

  it("can enforce special character requirements", () => {
    expect(
      generatePassword({ total: 14, special: 2 }).match(
        /([!@#\$%\^\&*\)\(+=._-{}])/g,
      ).length >= 2,
    ).toBe(true);
  });
});
