import MetabaseUtils from "metabase/lib/utils";
import MetabaseSettings from "metabase/lib/settings";

describe("utils", () => {
  describe("generatePassword", () => {
    it("defaults to at least 14 characters even if password_complexity requirements are lower", () => {
      MetabaseSettings.set("password_complexity", { total: 10 });
      expect(MetabaseUtils.generatePassword().length).toBe(14);
    });

    it("defaults to complexity requirements if greater than 14", () => {
      MetabaseSettings.set("password_complexity", { total: 20 });
      expect(MetabaseUtils.generatePassword().length).toBe(20);
    });

    it("falls back to length 14 passwords", () => {
      expect(MetabaseUtils.generatePassword({}).length).toBe(14);
    });

    it("creates passwords for the length we specify", () => {
      expect(MetabaseUtils.generatePassword({ total: 25 }).length).toBe(25);
    });

    it("can enforce ", () => {
      expect(
        MetabaseUtils.generatePassword({ total: 14, digit: 2 }).match(/([\d])/g)
          .length >= 2,
      ).toBe(true);
    });

    it("can enforce digit requirements", () => {
      expect(
        MetabaseUtils.generatePassword({ total: 14, digit: 2 }).match(/([\d])/g)
          .length >= 2,
      ).toBe(true);
    });

    it("can enforce uppercase requirements", () => {
      expect(
        MetabaseUtils.generatePassword({ total: 14, uppercase: 2 }).match(
          /([A-Z])/g,
        ).length >= 2,
      ).toBe(true);
    });

    it("can enforce special character requirements", () => {
      expect(
        MetabaseUtils.generatePassword({ total: 14, special: 2 }).match(
          /([!@#\$%\^\&*\)\(+=._-{}])/g,
        ).length >= 2,
      ).toBe(true);
    });
  });

  describe("compareVersions", () => {
    it("should compare versions correctly", () => {
      let expected = [
        "0.0.9",
        "0.0.10-snapshot",
        "0.0.10-alpha1",
        "0.0.10-rc1",
        "0.0.10-rc2",
        "0.0.10-rc10",
        "0.0.10",
        "0.1.0",
        "0.2.0",
        "0.10.0",
        "1.1.0",
      ];
      let shuffled = expected.slice();
      shuffle(shuffled);
      shuffled.sort(MetabaseUtils.compareVersions);
      expect(shuffled).toEqual(expected);
    });
  });

  describe("isEmpty", () => {
    it("should not allow all-blank strings", () => {
      expect(MetabaseUtils.isEmpty(" ")).toEqual(true);
    });
  });

  describe("isJWT", () => {
    it("should allow for JWT tokens with dashes", () => {
      expect(
        MetabaseUtils.isJWT(
          "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJwYXJhbXMiOnsicGFyYW0xIjoidGVzdCIsInBhcmFtMiI6ImFiIiwicGFyYW0zIjoiMjAwMC0wMC0wMFQwMDowMDowMCswMDowMCIsInBhcmFtNCI6Iu-8iO-8iSJ9LCJyZXNvdXJjZSI6eyJkYXNoYm9hcmQiOjB9fQ.wsNWliHJNwJBv_hx0sPo1EGY0nATdgEa31TM1AYotIA",
        ),
      ).toEqual(true);
    });
  });
});

function shuffle(a) {
  for (let i = a.length; i; i--) {
    let j = Math.floor(Math.random() * i);
    [a[i - 1], a[j]] = [a[j], a[i - 1]];
  }
}
