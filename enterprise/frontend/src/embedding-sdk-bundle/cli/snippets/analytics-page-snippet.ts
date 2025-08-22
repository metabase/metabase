/**
 * A minimal setup that brings together SDK provider,
 * theme switcher, and a sample dashboard.
 */
export const ANALYTICS_PAGE_SNIPPET = `
import { AnalyticsProvider } from './analytics-provider'
import { EmbeddingProvider } from './embedding-provider'
import { AnalyticsDashboard } from './analytics-dashboard'

import './analytics.css'

export const AnalyticsPage = () => (
  <AnalyticsProvider>
    <EmbeddingProvider>
      <AnalyticsDashboard />
    </EmbeddingProvider>
  </AnalyticsProvider>
)
`;
