import { generatePassword } from "./security";

describe("generatePassword", () => {
  it("defaults to at least 14 characters even if password-complexity requirements are lower", () => {
    expect(generatePassword({ total: 10 }).length).toBe(14);
  });

  it("defaults to complexity requirements if greater than 14", () => {
    expect(generatePassword({ total: 20 }).length).toBe(20);
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
