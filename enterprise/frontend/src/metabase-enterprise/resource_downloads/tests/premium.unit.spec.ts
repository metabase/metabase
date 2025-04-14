import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

import { downloadsEnabledTestData, setup } from "./setup";

describe("[EE - with token features] resource downloads plugin", () => {
  describe("areDownloadsEnabled", () => {
    beforeEach(() => {
      setup({
        hasEnterprisePlugins: true,
        tokenFeatures: createMockTokenFeatures({ whitelabel: true }),
      });
    });

    it.each(downloadsEnabledTestData)(
      `with { downloads:$downloads, hide_download_button:$hide_download_button } it should return $downloadsEnabled`,
      ({ hide_download_button, downloads, downloadsEnabled }) => {
        expect(
          PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
            hide_download_button,
            downloads,
          }),
        ).toStrictEqual(downloadsEnabled);
      },
    );
  });
});
