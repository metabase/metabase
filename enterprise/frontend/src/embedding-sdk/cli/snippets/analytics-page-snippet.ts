/**
 * A minimal setup that brings together SDK provider,
 * theme switcher, and a sample dashboard.
 */
export const ANALYTICS_PAGE_SNIPPET = `
import { AnalyticsDashboard } from './analytics-dashboard'
import { MetabaseEmbedProvider, SampleThemeProvider } from './metabase-provider'

import './analytics.css'

export const AnalyticsPage = () => (
  <SampleThemeProvider>
    <MetabaseEmbedProvider>
      <AnalyticsDashboard />
    </MetabaseEmbedProvider>
  </SampleThemeProvider>
)
`;
