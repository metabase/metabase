import type { Action, Middleware, ThunkDispatch } from "@reduxjs/toolkit";
import type { ComponentType, ReactNode } from "react";

import type {
  AdminPathKey,
  DraftDashboardSubscription,
  State,
} from "metabase/redux/store";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { Dashboard } from "metabase-types/api";

import type {
  SnippetSidebarContext,
  SnippetSidebarMenuOption,
  SnippetSidebarRowRenderers,
} from "./snippets";

interface PluginDashboardSubscriptionParametersSectionOverride {
  Component?: ComponentType<{
    className?: string;
    parameters: UiParameter[];
    hiddenParameters?: string;
    dashboard: Dashboard;
    pulse: DraftDashboardSubscription;
    setPulseParameters: (parameters: UiParameter[]) => void;
  }>;
}

const getDefaultAppInitFunctions = (): (() => void)[] => [];

export const PLUGIN_APP_INIT_FUNCTIONS = getDefaultAppInitFunctions();

// dispatch is typed as thunk-capable so EE middlewares can dispatch async thunks
const getDefaultReduxMiddlewares = (): Middleware<
  Record<string, never>,
  State,
  ThunkDispatch<State, unknown, Action>
>[] => [];

export const PLUGIN_REDUX_MIDDLEWARES = getDefaultReduxMiddlewares();

const getDefaultAdminAllowedPathGetters = (): ((
  user: any,
) => AdminPathKey[])[] => [];

export const PLUGIN_ADMIN_ALLOWED_PATH_GETTERS =
  getDefaultAdminAllowedPathGetters();

const getDefaultFormWidgets = (): Record<string, ComponentType<any>> => ({});

export const PLUGIN_FORM_WIDGETS = getDefaultFormWidgets();

const getDefaultSnippetSidebarPlusMenuOptions = (): ((
  snippetSidebar: SnippetSidebarContext,
) => SnippetSidebarMenuOption)[] => [];
const getDefaultSnippetSidebarRowRenderers =
  (): SnippetSidebarRowRenderers => ({
    collection: null,
  });
const getDefaultSnippetSidebarHeaderButtons = (): ((
  snippetSidebar: SnippetSidebarContext,
  opts: { className?: string },
) => ReactNode)[] => [];

export const PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS =
  getDefaultSnippetSidebarPlusMenuOptions();
export const PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS =
  getDefaultSnippetSidebarRowRenderers();
export const PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS =
  getDefaultSnippetSidebarHeaderButtons();

const getDefaultDashboardSubscriptionParametersSectionOverride =
  (): PluginDashboardSubscriptionParametersSectionOverride => ({
    Component: undefined,
  });

export const PLUGIN_DASHBOARD_SUBSCRIPTION_PARAMETERS_SECTION_OVERRIDE =
  getDefaultDashboardSubscriptionParametersSectionOverride();

const getDefaultReducers = () => ({
  advancedPermissionsPlugin: () => null,
  applicationPermissionsPlugin: () => null,
  sandboxingPlugin: () => null,
  shared: () => null,
  documents: () => null,
  remoteSyncPlugin: () => null,
});

export const PLUGIN_REDUCERS: {
  advancedPermissionsPlugin: any;
  applicationPermissionsPlugin: any;
  sandboxingPlugin: any;
  shared: any;
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

  PLUGIN_REDUX_MIDDLEWARES.length = 0;
  PLUGIN_REDUX_MIDDLEWARES.push(...getDefaultReduxMiddlewares());

  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.length = 0;
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(
    ...getDefaultAdminAllowedPathGetters(),
  );

  Object.assign(PLUGIN_FORM_WIDGETS, getDefaultFormWidgets());

  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.length = 0;
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.push(
    ...getDefaultSnippetSidebarPlusMenuOptions(),
  );

  Object.assign(
    PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
    getDefaultSnippetSidebarRowRenderers(),
  );

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
