// A synced bundle is cached byte-for-byte — nothing here builds or evaluates it —
// so tests that only care how an app materializes can ship a placeholder. Apps
// that have to actually render live in `assets/data-apps/` and are built by the
// `buildDataApp` task instead.
export default () => "unique-slug-app bundle";
