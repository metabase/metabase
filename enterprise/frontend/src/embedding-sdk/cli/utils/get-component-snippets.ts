import {
  ANALYTICS_PAGE_SNIPPET,
  ANALYTICS_PROVIDER_SNIPPET_MINIMAL,
  ANALYTICS_PROVIDER_SNIPPET_WITH_TENANCY,
  THEME_SWITCHER_SNIPPET,
  getAnalyticsDashboardSnippet,
  getEmbeddingProviderSnippet,
  getUserSwitcherSnippet,
} from "../snippets";
import type { DashboardInfo } from "../types/dashboard";

interface Options {
  instanceUrl: string;
  apiKey: string;
  dashboards: DashboardInfo[];
  tenancyIsolationEnabled: boolean;
}

export function getComponentSnippets(options: Options) {
  const { tenancyIsolationEnabled } = options;

  const analyticsDashboardSnippet = getAnalyticsDashboardSnippet(options);
  const embeddingProviderSnippet = getEmbeddingProviderSnippet(options);

  const analyticsProviderSnippet = tenancyIsolationEnabled
    ? ANALYTICS_PROVIDER_SNIPPET_WITH_TENANCY
    : ANALYTICS_PROVIDER_SNIPPET_MINIMAL;

  const components = [
    {
      name: "analytics-provider",
      content: analyticsProviderSnippet.trim(),
    },
    {
      name: "embedding-provider",
      content: embeddingProviderSnippet.trim(),
    },
    {
      name: "analytics-dashboard",
      content: analyticsDashboardSnippet.trim(),
    },
    {
      name: "theme-switcher",
      content: THEME_SWITCHER_SNIPPET.trim(),
    },
    {
      name: "analytics-page",
      content: ANALYTICS_PAGE_SNIPPET.trim(),
    },
  ];

  // Only generate the user switcher when multi-tenancy is enabled.
  if (tenancyIsolationEnabled) {
    components.push({
      name: "user-switcher",
      content: getUserSwitcherSnippet().trim(),
    });
  }

  return components;
}
