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

interface Options {
  instanceUrl: string;
  apiKey: string;
  dashboards: DashboardInfo[];
  userSwitcherEnabled: boolean;
}

export function getComponentSnippets(options: Options) {
  const { userSwitcherEnabled } = options;

  const analyticsDashboardSnippet = getAnalyticsDashboardSnippet(options);
  const embeddingProviderSnippet = getEmbeddingProviderSnippet(options);

  const analyticsProviderSnippet = userSwitcherEnabled
    ? ANALYTICS_PROVIDER_SNIPPET_WITH_USER_SWITCHER
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
  if (userSwitcherEnabled) {
    components.push({
      name: "user-switcher",
      content: getUserSwitcherSnippet().trim(),
    });
  }

  return components;
}
