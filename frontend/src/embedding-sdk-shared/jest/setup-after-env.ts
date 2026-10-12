import { format } from "util";

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

const ACT_WARNING_PATTERNS = [
  /was not wrapped in act\(/,
  /not configured to support act\(/,
];

const actWarnings: string[] = [];
const originalConsoleError = console.error;

// Throwing here would land inside React's render, where an error boundary can
// swallow it, so the warnings are collected and reported after the test.
console.error = (...args: unknown[]) => {
  originalConsoleError(...args);

  const [template] = args;
  const isActWarning =
    typeof template === "string" &&
    ACT_WARNING_PATTERNS.some((pattern) => pattern.test(template));

  if (isActWarning) {
    actWarnings.push(format(...args));
  }
};

afterEach(() => {
  const warnings = actWarnings.splice(0);

  if (warnings.length > 0) {
    throw new Error(
      `Test completed with React act() warnings:\n${warnings.join("\n")}`,
    );
  }
});
