import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";

import { downloadsEnabledTestData, setup } from "./setup";

describe("[OSS] resource downloads plugin", () => {
  beforeAll(() => {
    setup({ hasEnterprisePlugins: false });
  });

  describe("areDownloadsEnabled - should always return true on OSS", () => {
    it.each(downloadsEnabledTestData)(
      `with { downloads:$downloads } it should return true`,
      ({ downloads }) => {
        expect(
          PLUGIN_RESOURCE_DOWNLOADS.areDownloadsEnabled({
            downloads,
          }),
        ).toStrictEqual({ pdf: true, results: true });
      },
    );
  });
});
