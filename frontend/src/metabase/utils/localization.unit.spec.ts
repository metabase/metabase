import { isDayjsLocaleLoaded } from "metabase/dayjs";

import { loadLocaleCatalog } from "./localization";

describe("loadLocaleCatalog", () => {
  it("should load the dayjs locale with the catalogue, so setLocalization can switch to it", async () => {
    expect(isDayjsLocaleLoaded("ko")).toBe(false);

    const catalog = await loadLocaleCatalog("ko");

    expect(catalog.headers.language).toBe("ko");
    expect(isDayjsLocaleLoaded("ko")).toBe(true);
  });

  it("should not load a dayjs locale for English", async () => {
    const catalog = await loadLocaleCatalog("en");

    expect(catalog.headers.language).toBe("en");
    expect(isDayjsLocaleLoaded("en")).toBe(true);
  });
});
