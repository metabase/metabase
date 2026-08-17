import type { ComponentType } from "react";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
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

export const PLUGIN_SELECTORS = getDefaultSelectors();

const getDefaultPluginWhitelabel = () => ({
  WhiteLabelBrandingSettingsPage: PluginPlaceholder,
  WhiteLabelConcealSettingsPage: PluginPlaceholder,
});

export const PLUGIN_WHITELABEL = getDefaultPluginWhitelabel();

const getDefaultLandingPage = () => ({
  getLandingPage: () => "/",
});

export const PLUGIN_LANDING_PAGE: {
  getLandingPage: () => string | null | undefined;
} = getDefaultLandingPage();

const getDefaultHomepageSetting = () => ({
  CustomUrlOption: null,
});

export const PLUGIN_HOMEPAGE_SETTING: {
  CustomUrlOption: { label: string; Control: ComponentType } | null;
} = getDefaultHomepageSetting();

const getDefaultLogoIconComponents = (): ComponentType[] => [];

export const PLUGIN_LOGO_ICON_COMPONENTS = getDefaultLogoIconComponents();

/**
 * @internal Do not call directly. Use reinitializePlugins from __support__/plugins instead.
 */
export function reinitialize() {
  Object.assign(PLUGIN_SELECTORS, getDefaultSelectors());
  Object.assign(PLUGIN_WHITELABEL, getDefaultPluginWhitelabel());
  Object.assign(PLUGIN_LANDING_PAGE, getDefaultLandingPage());
  Object.assign(PLUGIN_HOMEPAGE_SETTING, getDefaultHomepageSetting());
  PLUGIN_LOGO_ICON_COMPONENTS.length = 0;
  PLUGIN_LOGO_ICON_COMPONENTS.push(...getDefaultLogoIconComponents());
}
