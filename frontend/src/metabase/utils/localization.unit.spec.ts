import * as dayjsModule from "metabase/dayjs";

import { loadLocaleCatalog } from "./localization";

describe("loadLocaleCatalog", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should load the dayjs locale with the catalogue, so setLocalization can switch to it", async () => {
    const loadDayjsLocale = jest.spyOn(dayjsModule, "loadDayjsLocale");

    const catalog = await loadLocaleCatalog("ko");

    expect(catalog.headers.language).toBe("ko");
    expect(loadDayjsLocale).toHaveBeenCalledWith("ko");
    expect(dayjsModule.isDayjsLocaleLoaded("ko")).toBe(true);
  });

  it("should not load a dayjs locale for English", async () => {
    const loadDayjsLocale = jest.spyOn(dayjsModule, "loadDayjsLocale");

    const catalog = await loadLocaleCatalog("en");

    expect(catalog.headers.language).toBe("en");
    expect(loadDayjsLocale).not.toHaveBeenCalled();
  });
});
