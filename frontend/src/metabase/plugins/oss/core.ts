import type { Middleware } from "@reduxjs/toolkit";
import type { ComponentType } from "react";
import { t } from "ttag";

import noResultsSource from "assets/img/no_results.svg";
import { PluginPlaceholder } from "metabase/plugins/components/PluginPlaceholder";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard, Pulse } from "metabase-types/api";
import type { AdminPathKey, State } from "metabase-types/store";

export const PLUGIN_APP_INIT_FUNCTIONS: (() => void)[] = [];

export const PLUGIN_LANDING_PAGE: {
  getLandingPage: () => string | null | undefined;
  LandingPageWidget: ComponentType;
} = {
  getLandingPage: () => "/",
  LandingPageWidget: PluginPlaceholder,
};

export const PLUGIN_REDUX_MIDDLEWARES: Middleware[] = [];

export const PLUGIN_LOGO_ICON_COMPONENTS: ComponentType[] = [];

export const PLUGIN_ADMIN_ALLOWED_PATH_GETTERS: ((
  user: any,
) => AdminPathKey[])[] = [];

export const PLUGIN_ADMIN_TOOLS: {
  COMPONENT: ComponentType | null;
} = {
  COMPONENT: null,
};

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

export type IllustrationValue = {
  src: string;
  isDefault: boolean;
} | null;

export const PLUGIN_SELECTORS = {
  canWhitelabel: (_state: State) => false,
  getLoadingMessageFactory: (_state: State) => getLoadingMessage,
  getIsWhiteLabeling: (_state: State) => false,
  // eslint-disable-next-line no-literal-metabase-strings -- This is the actual Metabase name, so we don't want to translate it.
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
};

export const PLUGIN_FORM_WIDGETS: Record<string, ComponentType<any>> = {};

export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS = [];
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS = {};
export const PLUGIN_SNIPPET_SIDEBAR_MODALS = [];
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS = [];

interface PluginDashboardSubscriptionParametersSectionOverride {
  Component?: ComponentType<{
    className?: string;
    parameters: UiParameter[];
    hiddenParameters?: string;
    dashboard: Dashboard;
    pulse: Pulse;
    setPulseParameters: (parameters: UiParameter[]) => void;
  }>;
}
export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE: PluginDashboardSubscriptionParametersSectionOverride =
  {
    Component: undefined,
  };

export const PLUGIN_REDUCERS: {
  applicationPermissionsPlugin: any;
  sandboxingPlugin: any;
  shared: any;
  metabotPlugin: any;
  documents: any;
  remoteSyncPlugin: any;
} = {
  applicationPermissionsPlugin: () => null,
  sandboxingPlugin: () => null,
  shared: () => null,
  metabotPlugin: () => null,
  documents: () => null,
  remoteSyncPlugin: () => null,
};

export const PLUGIN_IS_EE_BUILD = {
  isEEBuild: () => false,
};
