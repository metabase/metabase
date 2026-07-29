import { createMockSettings } from "metabase-types/api/mocks";

// `metabase-bootstrap.js` runs once per test file, before any test executes.
// It sets `window.MetabaseBootstrap` to the metadata a real server-rendered page would inject:
// the semantic type hierarchy, available timezones, and locales. The shared afterEach in
// `jest-setup-env.js` deletes `window.MetabaseBootstrap` after every test,
// so from the second test onward that metadata is gone from the global and
// `setupFiles` never run again to restore it. Capture the value here, so we can
// restore it before each test complete with Metadata
const initialBootstrap = window.MetabaseBootstrap;

beforeEach(() => {
  // Give every core test the default settings a real Metabase page starts
  // with, since the server always injects a bootstrap before the app runs.
  // Tests that need specific values still seed them via
  // `storeInitialState.settings`, which overwrites this baseline. The SDK
  // project deliberately does not get this seeding, because an SDK host page
  // never has a bootstrap and its settings stay empty until auth fills the
  // cache.
  window.MetabaseBootstrap = { ...initialBootstrap, ...createMockSettings() };
});
