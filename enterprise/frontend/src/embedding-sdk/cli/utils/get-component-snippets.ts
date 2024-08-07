import {
  getAnalyticsDashboardSnippet,
  getMetabaseProviderSnippet,
  THEME_SWITCHER_SNIPPET,
  ANALYTICS_PAGE_SNIPPET,
} from "../snippets";
import type { DashboardInfo } from "../types/dashboard";

interface Options {
  instanceUrl: string;
  apiKey: string;
  dashboards: DashboardInfo[];
}

export function getComponentSnippets(options: Options) {
  const { instanceUrl, apiKey, dashboards } = options;

  const analyticsDashboardSnippet = getAnalyticsDashboardSnippet(
    instanceUrl,
    dashboards,
  ).trim();

  const metabaseProviderSnippet = getMetabaseProviderSnippet(
    instanceUrl,
    apiKey,
  ).trim();

  return [
    {
      name: "metabase-provider",
      content: metabaseProviderSnippet,
    },
    {
      name: "analytics-dashboard",
      content: analyticsDashboardSnippet,
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
}
