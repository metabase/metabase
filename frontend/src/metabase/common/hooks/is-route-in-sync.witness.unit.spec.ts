import MetabaseSettings from "metabase/utils/settings";

import { isRouteInSync } from "./is-route-in-sync";

// Witness for metabase#65500: when an interactive embed (iframe) is navigated
// via postMessage, window.location updates before react-router's location prop.
// During that window the route is out of sync, and isRouteInSync must report
// false so the app bails on rendering (instead of getting stuck on a 404).
describe("isRouteInSync (metabase#65500 witness)", () => {
  beforeAll(() => {
    MetabaseSettings.set("site-url", "http://localhost:3000");
  });

  afterAll(() => {
    MetabaseSettings.set("site-url", undefined as any);
    delete (window as any).overrideIsWithinIframe;
  });

  it("returns false inside an iframe when the router route lags window.location", () => {
    (window as any).overrideIsWithinIframe = true;
    // window.location already points at the new (valid) page...
    window.history.pushState({}, "", "/dashboard/1");
    // ...but react-router still holds the old (invalid) location.
    expect(isRouteInSync("/dashboard/9999990")).toBe(false);
  });
});
