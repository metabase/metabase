import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { onReinitialize } from "metabase/plugins";
import type { State } from "metabase/redux/store";

export type IllustrationValue = {
  src: string;
  isDefault: boolean;
} | null;

const defaultLandingPageIllustration = {
  src: "app/img/bridge.svg",
  isDefault: true,
};

const defaultLoginPageIllustration = {
  src: "app/img/bridge.svg",
  isDefault: true,
};

const getLoadingMessage = (isSlow: boolean | undefined = false) =>
  isSlow ? t`Waiting for results...` : t`Doing science...`;

const getDefaultSelectors = () => ({
  canWhitelabel: (_state: State) => false,
  getLoadingMessageFactory: (_state: State) => getLoadingMessage,
  getIsWhiteLabeling: (_state: State) => false,
  // eslint-disable-next-line metabase/no-literal-metabase-strings -- This is the actual Metabase name, so we don't want to translate it.
  getApplicationName: (_state: State) => "Metabase",
  getShowMetabaseLinks: (_state: State) => true,
  getLoginPageIllustration: (_state: State): IllustrationValue => {
    return defaultLoginPageIllustration;
  },
  getLandingPageIllustration: (_state: State): IllustrationValue => {
    return defaultLandingPageIllustration;
  },
  getNoDataIllustration: (_state: State): string | null => {
    return noResultsSource;
  },
  getNoObjectIllustration: (_state: State): string | null => {
    return noResultsSource;
  },
});

// The EE whitelabel plugin reassigns these slots under the whitelabel token.
// The wrappers in selectors.ts read them at call time so the reassignment is seen.
export const PLUGIN_SELECTORS = getDefaultSelectors();

onReinitialize(() => {
  Object.assign(PLUGIN_SELECTORS, getDefaultSelectors());
});
