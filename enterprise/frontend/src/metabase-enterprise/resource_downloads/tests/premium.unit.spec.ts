import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { downloadsEnabledTestData, setup } from "./setup";

describe("[EE - with token features] resource downloads plugin", () => {
  describe("areDownloadsEnabled", () => {
    beforeEach(() => {
      setup({
        tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
        enterprisePlugins: ["resource_downloads"],
      });
    });

    it.each(downloadsEnabledTestData)(
      `with { downloads:$downloads } it should return $downloadsEnabled`,
      ({ downloads, downloadsEnabled }) => {
        expect(
          PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
            downloads,
          }),
        ).toStrictEqual(downloadsEnabled);
      },
    );
  });
});
