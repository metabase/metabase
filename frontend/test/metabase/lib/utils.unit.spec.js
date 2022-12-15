import MetabaseUtils from "metabase/lib/utils";

describe("utils", () => {
  describe("compareVersions", () => {
    it("should compare versions correctly", () => {
      const expected = [
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
      const shuffled = expected.slice();
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
    const j = Math.floor(Math.random() * i);
    [a[i - 1], a[j]] = [a[j], a[i - 1]];
  }
}
