import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";

import { downloadsEnabledTestData, setup } from "./setup";

describe("[EE - no features] resource downloads plugin", () => {
  beforeAll(() => {
    setup({ hasEnterprisePlugins: false });
  });

  describe("areDownloadsEnabled - should always return true if we don't have the whitelabel feature", () => {
    it.each(downloadsEnabledTestData)(
      `with { downloads:$downloads, hide_download_button:$hide_download_button } it should return true`,
      ({ hide_download_button, downloads }) => {
        expect(
          PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
            hide_download_button,
            downloads,
          }),
        ).toStrictEqual({ pdf: true, results: true });
      },
    );
  });
});
