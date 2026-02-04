import type { Middleware } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, DashboardSubscription } from "metabase-types/api";
import type { AdminPathKey, State } from "metabase-types/store";

// Types
export type IllustrationValue = {
  src: string;
  isDefault: boolean;
} | null;

interface PluginDashboardSubscriptionParametersSectionOverride {
  Component?: ComponentType<{
    className?: string;
    parameters: UiParameter[];
    hiddenParameters?: string;
    dashboard: Dashboard;
    pulse: DashboardSubscription;
    setPulseParameters: (parameters: UiParameter[]) => void;
  }>;
}

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

const getDefaultAppInitFunctions = (): (() => void)[] => [];

export const PLUGIN_APP_INIT_FUNCTIONS = getDefaultAppInitFunctions();

const getDefaultLandingPage = () => ({
  getLandingPage: () => "/",
  LandingPageWidget: PluginPlaceholder,
});

export const PLUGIN_LANDING_PAGE: {
  getLandingPage: () => string | null | undefined;
  LandingPageWidget: ComponentType;
} = getDefaultLandingPage();

const getDefaultReduxMiddlewares = (): Middleware[] => [];

export const PLUGIN_REDUX_MIDDLEWARES = getDefaultReduxMiddlewares();

const getDefaultLogoIconComponents = (): ComponentType[] => [];

export const PLUGIN_LOGO_ICON_COMPONENTS = getDefaultLogoIconComponents();

const getDefaultAdminAllowedPathGetters = (): ((
  user: any,
) => AdminPathKey[])[] => [];

export const PLUGIN_ADMIN_ALLOWED_PATH_GETTERS =
  getDefaultAdminAllowedPathGetters();

const getDefaultAdminTools = () => ({
  COMPONENT: null,
});

export const PLUGIN_ADMIN_TOOLS: {
  COMPONENT: ComponentType | null;
} = getDefaultAdminTools();

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

const getDefaultFormWidgets = (): Record<string, ComponentType<any>> => ({});

export const PLUGIN_FORM_WIDGETS = getDefaultFormWidgets();

const getDefaultSnippetSidebarPlusMenuOptions = () => [];
const getDefaultSnippetSidebarRowRenderers = () => ({});
const getDefaultSnippetSidebarModals = () => [];
const getDefaultSnippetSidebarHeaderButtons = () => [];

export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS =
  getDefaultSnippetSidebarPlusMenuOptions();
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS =
  getDefaultSnippetSidebarRowRenderers();
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = getDefaultSnippetSidebarModals();
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS =
  getDefaultSnippetSidebarHeaderButtons();

const getDefaultDashboardSubscriptionParametersSectionOverride =
  (): PluginDashboardSubscriptionParametersSectionOverride => ({
    Component: undefined,
  });

export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE =
  getDefaultDashboardSubscriptionParametersSectionOverride();

const getDefaultReducers = () => ({
  applicationPermissionsPlugin: () => null,
  sandboxingPlugin: () => null,
  shared: () => null,
  metabotPlugin: () => null,
  documents: () => null,
  remoteSyncPlugin: () => null,
});

export const PLUGIN_REDUCERS: {
  applicationPermissionsPlugin: any;
  sandboxingPlugin: any;
  shared: any;
  metabotPlugin: any;
  documents: any;
  remoteSyncPlugin: any;
} = getDefaultReducers();

const getDefaultIsEeBuild = () => ({
  isEEBuild: () => false,
});

export const PLUGIN_IS_EE_BUILD = getDefaultIsEeBuild();

/**
 * @internal Do not call directly. Use the main reinitialize function from metabase/plugins instead.
 */
export function reinitialize() {
  PLUGIN_APP_INIT_FUNCTIONS.length = 0;
  PLUGIN_APP_INIT_FUNCTIONS.push(...getDefaultAppInitFunctions());

  Object.assign(PLUGIN_LANDING_PAGE, getDefaultLandingPage());

  PLUGIN_REDUX_MIDDLEWARES.length = 0;
  PLUGIN_REDUX_MIDDLEWARES.push(...getDefaultReduxMiddlewares());

  PLUGIN_LOGO_ICON_COMPONENTS.length = 0;
  PLUGIN_LOGO_ICON_COMPONENTS.push(...getDefaultLogoIconComponents());

  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.length = 0;
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(
    ...getDefaultAdminAllowedPathGetters(),
  );

  Object.assign(PLUGIN_ADMIN_TOOLS, getDefaultAdminTools());
  Object.assign(PLUGIN_SELECTORS, getDefaultSelectors());
  Object.assign(PLUGIN_FORM_WIDGETS, getDefaultFormWidgets());

  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.length = 0;
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.push(
    ...getDefaultSnippetSidebarPlusMenuOptions(),
  );

  Object.assign(
    PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
    getDefaultSnippetSidebarRowRenderers(),
  );

  PLUGIN_SNIPPET_SIDEBAR_MODALS.length = 0;
  PLUGIN_SNIPPET_SIDEBAR_MODALS.push(...getDefaultSnippetSidebarModals());

  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.length = 0;
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.push(
    ...getDefaultSnippetSidebarHeaderButtons(),
  );

  Object.assign(
    PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE,
    getDefaultDashboardSubscriptionParametersSectionOverride(),
  );
  Object.assign(PLUGIN_REDUCERS, getDefaultReducers());
  Object.assign(PLUGIN_IS_EE_BUILD, getDefaultIsEeBuild());
}
