import MetabaseUtils from "metabase/lib/utils";

describe("utils", () => {
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
