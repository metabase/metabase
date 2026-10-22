import type { TokenFeatures } from "metabase-types/api";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { getPlan } from "./plan";

const STARTER_CLOUD_TOKEN_FEATURES: Partial<TokenFeatures> = {
  hosting: true,
  config_text_file: true,
  "offer-metabase-ai-managed": true,
  "support-users": true,
};

describe("metabase/settings/plan", () => {
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

    it("returns `starter` for the features of a Starter Cloud token", () => {
      expect(
        getPlan(createMockTokenFeatures(STARTER_CLOUD_TOKEN_FEATURES)),
      ).toBe("starter");
    });

    it("returns `starter-with-dwh` for the features of a Starter Cloud token with an attached DWH", () => {
      expect(
        getPlan(
          createMockTokenFeatures({
            ...STARTER_CLOUD_TOKEN_FEATURES,
            attached_dwh: true,
          }),
        ),
      ).toBe("starter-with-dwh");
    });

    it("returns `pro-cloud` if the token features object has the `hosting` feature and any Pro feature", () => {
      expect(
        getPlan(
          createMockTokenFeatures({
            hosting: true,
            advanced_permissions: true,
          }),
        ),
      ).toBe("pro-cloud");
    });

    it("returns `pro-cloud` for the features of a Starter Cloud token plus any Pro feature", () => {
      expect(
        getPlan(
          createMockTokenFeatures({
            ...STARTER_CLOUD_TOKEN_FEATURES,
            advanced_permissions: true,
          }),
        ),
      ).toBe("pro-cloud");
    });

    it("returns `pro-cloud-with-dwh` if the token features object has the `hosting` and `attached_dwh` features and any Pro feature", () => {
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

    it("returns `pro-self-hosted` if the token features object has at least one Pro feature but the `hosting` is disabled", () => {
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
