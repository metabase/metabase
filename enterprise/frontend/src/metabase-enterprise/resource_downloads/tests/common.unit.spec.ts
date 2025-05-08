import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";

import { downloadsEnabledTestData, setup } from "./setup";

describe("[OSS] resource downloads plugin", () => {
  beforeAll(() => {
    setup({ hasEnterprisePlugins: false });
  });

  describe("areDownloadsEnabled - should always return true on OSS", () => {
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
