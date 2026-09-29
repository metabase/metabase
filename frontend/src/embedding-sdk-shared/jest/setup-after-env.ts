import { ensureMetabaseProviderPropsStore } from "embedding-sdk-shared/lib/ensure-metabase-provider-props-store";

afterEach(() => {
  ensureMetabaseProviderPropsStore().cleanup();
});

// `LocaleProvider` fetches a translation catalogue for whatever locale it is
// given, including the instance locale that mock settings default to "en". The
// load resolves after the test, so React reports the state it sets as an update
// outside act(). A test that exercises localization passes `locale` through
// `componentProviderProps`, which takes precedence over the instance locale.
jest.mock("metabase/common/hooks/use-instance-locale", () => ({
  useInstanceLocale: () => null,
}));
