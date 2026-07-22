import { createMockSettings } from "metabase-types/api/mocks";

// The initial bootstrap set once per file by `metabase-bootstrap.js` (type
// hierarchy, timezones, …). The shared afterEach in `jest-setup-env.js`
// deletes `window.MetabaseBootstrap` between tests, so capture the baseline
// here to rebuild from.
const initialBootstrap = window.MetabaseBootstrap;

beforeEach(() => {
  // Default-seed settings for every core test. Settings are read from the RTK
  // query cache with `window.MetabaseBootstrap` as the synchronous fallback
  // (see `getSettings`); this restores the implicit defaults the old settings
  // slice gave every test store, so hand-rolled selector tests work without
  // seeding by hand. Tests that need specific values still seed via
  // `storeInitialState.settings` (the render harness overwrites this), and
  // tests that need a setting to be absent must seed it as unset explicitly.
  //
  // The SDK project deliberately does NOT get this: an SDK host page never has
  // a bootstrap, so empty-until-auth is production behavior there.
  window.MetabaseBootstrap = { ...initialBootstrap, ...createMockSettings() };
});
