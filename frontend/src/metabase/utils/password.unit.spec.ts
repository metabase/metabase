import MetabaseSettings from "metabase/utils/settings";

import { generatePassword } from "./password";

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

  it("can enforce digit requirements", () => {
    expect(
      generatePassword({ total: 14, digit: 2 }).match(/\d/g)!.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("can enforce uppercase requirements", () => {
    expect(
      generatePassword({ total: 14, upper: 2 }).match(/[A-Z]/g)!.length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("can enforce lowercase requirements", () => {
    expect(
      generatePassword({ total: 14, lower: 3 }).match(/[a-z]/g)!.length,
    ).toBeGreaterThanOrEqual(3);
  });

  it("can enforce special character requirements", () => {
    expect(
      generatePassword({ total: 14, special: 2 }).match(/[!@#$%^&*()\-_+=]/g)!
        .length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("always meets strong complexity requirements", () => {
    const strongComplexity = {
      total: 10,
      lower: 2,
      upper: 2,
      digit: 1,
      special: 1,
    };

    // run 100 iterations to verify deterministic compliance
    for (let i = 0; i < 100; i++) {
      const password = generatePassword(strongComplexity);
      expect(password.length).toBeGreaterThanOrEqual(14);
      expect(password.match(/[a-z]/g)!.length).toBeGreaterThanOrEqual(2);
      expect(password.match(/[A-Z]/g)!.length).toBeGreaterThanOrEqual(2);
      expect(password.match(/\d/g)!.length).toBeGreaterThanOrEqual(1);
      expect(
        password.match(/[!@#$%^&*()\-_+=]/g)!.length,
      ).toBeGreaterThanOrEqual(1);
    }
  });
});
