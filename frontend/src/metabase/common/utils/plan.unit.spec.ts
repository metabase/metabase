import { getPlan } from "metabase/common/utils/plan";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

describe("common/utils/columns", () => {
  describe("getPlan", () => {
    it("returns `oss` if the token features object is undefined or null or does not have any features", () => {
      expect(getPlan()).toBe("oss");
      expect(getPlan(null)).toBe("oss");
      expect(getPlan(createMockTokenFeatures())).toBe("oss");
    });

    it("returns `starter` if the token features object has only the `hosting` feature", () => {
      expect(getPlan(createMockTokenFeatures({ hosting: true }))).toBe(
        "starter",
      );
    });

    it("returns `starter-with-dwh` if the token features object has only the `hosting` and `attached_dwh` features", () => {
      expect(
        getPlan(createMockTokenFeatures({ hosting: true, attached_dwh: true })),
      ).toBe("starter-with-dwh");
    });

    it("returns `pro-cloud` if the token features object has the `hosting` feature and any other feature", () => {
      expect(
        getPlan(
          createMockTokenFeatures({
            hosting: true,
            advanced_permissions: true,
          }),
        ),
      ).toBe("pro-cloud");
    });

    it("returns `pro-cloud-with-dwh` if the token features object has the `hosting` and `attached_dwh` features and any other feature", () => {
      expect(
        getPlan(
          createMockTokenFeatures({
            hosting: true,
            advanced_permissions: true,
            attached_dwh: true,
          }),
        ),
      ).toBe("pro-cloud-with-dwh");
    });

    it("returns `pro-self-hosted` if the token features object have at least one feature except but the `hosting` is disabled", () => {
      expect(
        getPlan(
          createMockTokenFeatures({
            hosting: false,
            advanced_permissions: true,
          }),
        ),
      ).toBe("pro-self-hosted");
    });
  });
});
