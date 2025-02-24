import {
  ANALYTICS_PAGE_SNIPPET,
  ANALYTICS_PROVIDER_SNIPPET_MINIMAL,
  ANALYTICS_PROVIDER_SNIPPET_WITH_USER_SWITCHER,
  THEME_SWITCHER_SNIPPET,
  getAnalyticsDashboardSnippet,
  getEmbeddingProviderSnippet,
  getUserSwitcherSnippet,
} from "../snippets";
import type { DashboardInfo } from "../types/dashboard";

import { withNextJsUseClientDirective } from "./nextjs-helpers";

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
