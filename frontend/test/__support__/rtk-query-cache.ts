// The implementation lives with the other mock-state builders so that
// `createMockState` (src) and test-support code share one seeding path — and
// one copy of the double-upsert guard (see the jsdoc on `seedApiQueryCache`).
export {
  type QueryCacheSeed,
  seedApiQueryCache,
} from "metabase/redux/store/mocks/api";
