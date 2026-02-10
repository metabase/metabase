import { type JSX, useMemo } from "react";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { MetabotQuestion } from "embedding-sdk-bundle/components/public/MetabotQuestion";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { StaticQuestion } from "embedding-sdk-bundle/components/public/StaticQuestion";
import {
  InteractiveDashboard,
  StaticDashboard,
} from "embedding-sdk-bundle/components/public/dashboard";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types/auth-config";
import type {
  MetabaseTheme,
  SqlParameterValues,
} from "embedding-sdk-bundle/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import type { CollectionId } from "metabase-types/api";
import type { CollectionBrowserListColumns } from "embedding-sdk-bundle/components/public/CollectionBrowser";
import type { ModularEmbeddingEntityType } from "metabase-types/store/embedding-data-picker";

import { MetabaseBrowser } from "./MetabaseBrowser";
import type { SdkIframeEmbedSettings } from "../types/embed";

// Base props that all web components receive
interface BaseWebComponentProps {
  instanceUrl?: string;
  apiKey?: string;
  isGuest?: boolean;
  jwtProviderUri?: string;
  theme?: MetabaseTheme;
  locale?: string;
}

// Get global config from window.metabaseConfig
function getGlobalConfig(): Partial<BaseWebComponentProps> {
  if (typeof window !== "undefined" && (window as any).metabaseConfig) {
    return (window as any).metabaseConfig;
  }
  return {};
}

// Merge props with global config (props take precedence)
function useMergedProps<T extends BaseWebComponentProps>(props: T): T {
  return useMemo(() => {
    const globalConfig = getGlobalConfig();
    return { ...globalConfig, ...props } as T;
  }, [props]);
}

// Parse ID from string to number if it's numeric
function parseId(id: number | string | null | undefined): number | null {
  if (id == null) {
    return null;
  }
  if (typeof id === "number") {
    return id;
  }
  const parsed = Number(id);
  return isNaN(parsed) ? null : parsed;
}

// Dashboard wrapper props
export interface DashboardWrapperProps extends BaseWebComponentProps {
  dashboardId?: number | string | null;
  token?: string;
  drills?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;
  withSubscriptions?: boolean;
  initialParameters?: ParameterValues;
  hiddenParameters?: string[];
}

// Question wrapper props
export interface QuestionWrapperProps extends BaseWebComponentProps {
  questionId?: number | string | null;
  token?: string;
  drills?: boolean;
  withTitle?: boolean;
  withDownloads?: boolean;
  withAlerts?: boolean;
  isSaveEnabled?: boolean;
  targetCollection?: CollectionId;
  entityTypes?: string[];
  initialSqlParameters?: SqlParameterValues;
  hiddenParameters?: string[];
}

// Browser wrapper props
export interface BrowserWrapperProps extends BaseWebComponentProps {
  initialCollection?: CollectionId;
  readOnly?: boolean;
  collectionVisibleColumns?: CollectionBrowserListColumns[];
  collectionPageSize?: number;
  collectionEntityTypes?: ("collection" | "dashboard" | "question" | "model")[];
  dataPickerEntityTypes?: ModularEmbeddingEntityType[];
  withNewQuestion?: boolean;
  withNewDashboard?: boolean;
}

// Metabot wrapper props
export interface MetabotWrapperProps extends BaseWebComponentProps {
  layout?: "auto" | "sidebar" | "stacked";
}

function useAuthConfig(props: BaseWebComponentProps): MetabaseAuthConfig {
  return useMemo(() => {
    const instanceUrl = props.instanceUrl ?? "";

    // Guest embed
    if (props.isGuest) {
      return {
        metabaseInstanceUrl: instanceUrl,
        isGuest: true,
      };
    }

    // API key auth
    if (props.apiKey) {
      return {
        metabaseInstanceUrl: instanceUrl,
        apiKey: props.apiKey,
      };
    }

    // JWT auth (when jwtProviderUri is provided)
    if (props.jwtProviderUri) {
      return {
        metabaseInstanceUrl: instanceUrl,
        jwtProviderUri: props.jwtProviderUri,
      };
    }

    // Default: JWT/SAML auth without explicit jwtProviderUri (will use SSO discovery)
    return {
      metabaseInstanceUrl: instanceUrl,
    };
  }, [props.instanceUrl, props.apiKey, props.isGuest, props.jwtProviderUri]);
}

export function MetabaseDashboardWrapper(
  rawProps: DashboardWrapperProps,
): JSX.Element {
  const props = useMergedProps(rawProps);
  console.log("MetabaseDashboardWrapper props", props);

  const authConfig = useAuthConfig(props);

  const {
    dashboardId,
    token,
    drills = true,
    withTitle,
    withDownloads,
    withSubscriptions,
    initialParameters,
    hiddenParameters,
    theme,
    locale,
  } = props;

  // Use StaticDashboard for token-based embedding or when drills are disabled
  const useStatic = false; //token != null || drills === false;
  const parsedDashboardId = parseId(dashboardId);

  return (
    <ComponentProvider authConfig={authConfig} theme={theme} locale={locale}>
      {useStatic ? (
        <StaticDashboard
          dashboardId={token ? undefined : parsedDashboardId}
          token={token}
          withTitle={withTitle}
          withDownloads={withDownloads}
          initialParameters={initialParameters}
          hiddenParameters={hiddenParameters}
          style={{ height: "100%", minHeight: "100vh" }}
        />
      ) : (
        <InteractiveDashboard
          dashboardId={parsedDashboardId}
          withTitle={withTitle}
          withDownloads={withDownloads}
          withSubscriptions={withSubscriptions}
          initialParameters={initialParameters}
          hiddenParameters={hiddenParameters}
          style={{ height: "100%", minHeight: "100vh" }}
          drillThroughQuestionHeight="100%"
          drillThroughQuestionProps={{ isSaveEnabled: false }}
        />
      )}
    </ComponentProvider>
  );
}

export function MetabaseQuestionWrapper(
  rawProps: QuestionWrapperProps,
): JSX.Element {
  const props = useMergedProps(rawProps);
  const authConfig = useAuthConfig(props);

  const {
    questionId,
    token,
    drills = true,
    withTitle = true,
    withDownloads,
    withAlerts,
    isSaveEnabled = false,
    targetCollection,
    entityTypes,
    initialSqlParameters,
    hiddenParameters,
    theme,
    locale,
  } = props;

  // Use StaticQuestion for token-based embedding or when drills are disabled
  const useStatic = token != null || drills === false;
  const parsedQuestionId = parseId(questionId);

  return (
    <ComponentProvider authConfig={authConfig} theme={theme} locale={locale}>
      {useStatic ? (
        <StaticQuestion
          questionId={token ? undefined : parsedQuestionId}
          token={token}
          title={withTitle}
          withDownloads={withDownloads}
          withAlerts={withAlerts}
          initialSqlParameters={initialSqlParameters}
          hiddenParameters={hiddenParameters}
          height="100%"
        />
      ) : (
        <SdkQuestion
          questionId={parsedQuestionId}
          title={withTitle}
          withDownloads={withDownloads}
          withAlerts={withAlerts}
          isSaveEnabled={isSaveEnabled}
          targetCollection={targetCollection}
          entityTypes={entityTypes as any}
          initialSqlParameters={initialSqlParameters}
          hiddenParameters={hiddenParameters}
          height="100%"
        />
      )}
    </ComponentProvider>
  );
}

export function MetabaseBrowserWrapper(
  rawProps: BrowserWrapperProps,
): JSX.Element {
  const props = useMergedProps(rawProps);
  const authConfig = useAuthConfig(props);

  const {
    initialCollection = "root",
    readOnly,
    collectionVisibleColumns,
    collectionPageSize,
    collectionEntityTypes,
    dataPickerEntityTypes,
    withNewQuestion,
    withNewDashboard,
    theme,
    locale,
  } = props;

  // Build settings object that MetabaseBrowser expects
  const settings: SdkIframeEmbedSettings & {
    componentName: "metabase-browser";
  } = {
    componentName: "metabase-browser",
    instanceUrl: props.instanceUrl,
    initialCollection,
    readOnly,
    collectionVisibleColumns,
    collectionPageSize,
    collectionEntityTypes,
    dataPickerEntityTypes,
    withNewQuestion,
    withNewDashboard,
  };

  return (
    <ComponentProvider authConfig={authConfig} theme={theme} locale={locale}>
      <MetabaseBrowser settings={settings} />
    </ComponentProvider>
  );
}

export function MetabaseMetabotWrapper(
  rawProps: MetabotWrapperProps,
): JSX.Element {
  const props = useMergedProps(rawProps);
  const authConfig = useAuthConfig(props);

  console.log("MetabaseMetabotWrapper props", props);

  const { layout, theme, locale } = props;

  return (
    <ComponentProvider authConfig={authConfig} theme={theme} locale={locale}>
      <MetabotQuestion layout={layout} height="100%" />
    </ComponentProvider>
  );
}
