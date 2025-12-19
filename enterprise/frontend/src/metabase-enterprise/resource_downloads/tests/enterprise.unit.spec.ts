import { PLUGIN_RESOURCE_DOWNLOADS } from "metabase/plugins";

import { downloadsEnabledTestData, setup } from "./setup";

describe("[EE - no features] resource downloads plugin", () => {
  beforeAll(() => {
    setup({});
  });

  describe("areDownloadsEnabled - should always return true if we don't have the whitelabel feature", () => {
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
