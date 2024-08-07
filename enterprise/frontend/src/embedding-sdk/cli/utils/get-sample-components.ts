import {
  getAnalyticsDashboardSnippet,
  getMetabaseProviderSnippet,
  getAnalyticsPageSnippet,
  THEME_SWITCHER_SNIPPET,
} from "../snippets";
import type { DashboardInfo } from "../types/dashboard";

interface Options {
  instanceUrl: string;
  apiKey: string;
  dashboards: DashboardInfo[];
}

export function getSampleComponents(options: Options) {
  const { instanceUrl, apiKey, dashboards } = options;

  const analyticsDashboardSnippet =
    getAnalyticsDashboardSnippet(instanceUrl).trim();

  const metabaseProviderSnippet = getMetabaseProviderSnippet(
    instanceUrl,
    apiKey,
  ).trim();

  const analyticsPageSnippet = getAnalyticsPageSnippet(dashboards).trim();

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
      content: analyticsPageSnippet,
    },
  ];
}
