// Next.js page for /app/analytics-demo/page.tsx or /pages/analytics-demo.tsx
export const getNextJsAnalyticsPageSnippet = ({
  resolveImport,
}: {
  resolveImport: (pathName: string) => string;
}) =>
  `import { AnalyticsDashboard } from '${resolveImport("analytics-dashboard")}'

export default function AnalyticsPage() {
  return (
    <AnalyticsDashboard />
  );
}
`.trim();
