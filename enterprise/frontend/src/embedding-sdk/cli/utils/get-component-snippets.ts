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
      content: analyticsProviderSnippet.trim(),
    },
    {
      fileName: "embedding-provider",
      componentName: "EmbeddingProvider",
      content: embeddingProviderSnippet.trim(),
    },
    {
      fileName: "analytics-dashboard",
      componentName: "AnalyticsDashboard",
      content: analyticsDashboardSnippet.trim(),
    },
    {
      fileName: "theme-switcher",
      componentName: "ThemeSwitcher",
      content: THEME_SWITCHER_SNIPPET.trim(),
    },
    {
      fileName: "analytics-page",
      componentName: "AnalyticsPage",
      content: ANALYTICS_PAGE_SNIPPET.trim(),
    },
  ];

  // Only generate the user switcher when multi-tenancy is enabled.
  if (userSwitcherEnabled) {
    components.push({
      fileName: "user-switcher",
      componentName: "UserSwitcher",
      content: getUserSwitcherSnippet().trim(),
    });
  }

  return components.map(component => {
    // Next.js uses "use client" to load the component on the client side.
    // It's fine to leave "use client" in the component even when using the Pages Router.
    // We must use the default export. A named export will not work.
    // Refer to https://www.metabase.com/docs/latest/embedding/sdk/next-js
    if (isNextJs) {
      const content = `"use client";\n\n${component.content}\n\nexport default ${component.componentName};`;

      return { ...component, content };
    }

    return component;
  });
}
