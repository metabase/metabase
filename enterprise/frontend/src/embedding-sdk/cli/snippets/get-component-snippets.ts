import type { DashboardInfo } from "../types/dashboard";
import { withNextJsUseClientDirective } from "../utils/nextjs-helpers";

import { getAnalyticsDashboardSnippet } from "./analytics-dashboard-snippet";
import { ANALYTICS_PAGE_SNIPPET } from "./analytics-page-snippet";
import {
  ANALYTICS_PROVIDER_SNIPPET_MINIMAL,
  ANALYTICS_PROVIDER_SNIPPET_WITH_USER_SWITCHER,
} from "./analytics-provider-snippet";
import { getEmbeddingProviderSnippet } from "./embedding-provider-snippet";
import { THEME_SWITCHER_SNIPPET } from "./theme-switcher-snippet";
import { getUserSwitcherSnippet } from "./user-switcher-snippet";

interface Options {
  instanceUrl: string;
  apiKey: string;
  dashboards: DashboardInfo[];
  userSwitcherEnabled: boolean;
  isNextJs: boolean;
}

type SampleComponent = {
  fileName: string;
  componentName: string;
  content: string;
};

export function getComponentSnippets(options: Options): SampleComponent[] {
  const { userSwitcherEnabled, isNextJs } = options;

  const analyticsDashboardSnippet = getAnalyticsDashboardSnippet(options);
  const embeddingProviderSnippet = getEmbeddingProviderSnippet(options);

  const analyticsProviderSnippet = userSwitcherEnabled
    ? ANALYTICS_PROVIDER_SNIPPET_WITH_USER_SWITCHER
    : ANALYTICS_PROVIDER_SNIPPET_MINIMAL;

  const components: SampleComponent[] = [
    {
      fileName: "analytics-provider",
      componentName: "AnalyticsProvider",
      content: withNextJsUseClientDirective(
        analyticsProviderSnippet,
        isNextJs,
      ).trim(),
    },
    {
      fileName: "embedding-provider",
      componentName: "EmbeddingProvider",
      content: withNextJsUseClientDirective(
        embeddingProviderSnippet,
        isNextJs,
      ).trim(),
    },
    {
      fileName: "analytics-dashboard",
      componentName: "AnalyticsDashboard",
      content: withNextJsUseClientDirective(
        analyticsDashboardSnippet,
        isNextJs,
      ).trim(),
    },
    {
      fileName: "theme-switcher",
      componentName: "ThemeSwitcher",
      content: THEME_SWITCHER_SNIPPET.trim(),
    },
  ];

  // Only generate the analytics page when not using Next.js.
  // This is to prevent unintentionally adding multiple providers to pages.
  if (!isNextJs) {
    components.push({
      fileName: "analytics-page",
      componentName: "AnalyticsPage",
      content: ANALYTICS_PAGE_SNIPPET.trim(),
    });
  }

  // Only generate the user switcher when multi-tenancy is enabled.
  if (userSwitcherEnabled) {
    components.push({
      fileName: "user-switcher",
      componentName: "UserSwitcher",
      content: getUserSwitcherSnippet().trim(),
    });
  }

  return components;
}
