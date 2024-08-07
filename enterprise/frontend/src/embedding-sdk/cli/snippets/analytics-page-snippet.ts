import type { DashboardInfo } from "../types/dashboard";

/**
 * A minimal setup that brings together SDK provider,
 * theme switcher, and a sample dashboard.
 */
export const getAnalyticsPageSnippet = (dashboards: DashboardInfo[]) => {
  const [firstDashboard, ...otherDashboards] = dashboards;

  let suggestionMessage = "";

  // In case the user picked two or more tables, we suggest
  // a couple more dashboards for the user to try out themselves.
  if (otherDashboards.length > 0) {
    const suggestions = otherDashboards
      .map(d => `${d.name} (${d.id})`)
      .join(", ");

    suggestionMessage += "\n       ";
    suggestionMessage += `{/* Try out these dashboards: ${suggestions} */}`;
  }

  const snippet = `
import { AnalyticsDashboard } from './analytics-dashboard'
import { MetabaseEmbedProvider, SampleThemeProvider } from './metabase-provider'

import './analytics.css'

export const AnalyticsPage = () => (
  <SampleThemeProvider>
    <MetabaseEmbedProvider>
      <div className="analytics-container">${suggestionMessage}
        <AnalyticsDashboard dashboardId={${firstDashboard.id}} />
      </div>
    </MetabaseEmbedProvider>
  </SampleThemeProvider>
)
`.trim();

  return snippet;
};
