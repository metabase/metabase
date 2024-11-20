/**
 * A minimal setup that brings together SDK provider,
 * theme switcher, and a sample dashboard.
 */
export const getAnalyticsPageSnippet = ({
  isNextJs,
}: {
  isNextJs: boolean;
}) => `
import { AnalyticsProvider } from './analytics-provider'
import { EmbeddingProvider } from './embedding-provider'
import { AnalyticsDashboard } from './analytics-dashboard'
${isNextJs ? "" : "\nimport './analytics.css'"}

export const AnalyticsPage = () => (
  <AnalyticsProvider>
    <EmbeddingProvider>
      <AnalyticsDashboard />
    </EmbeddingProvider>
  </AnalyticsProvider>
)
`;
