import path from "path";

import { checkIfUsingAppOrPagesRouter } from "../utils/nextjs-helpers";

// Next.js page for /app/analytics-demo/page.tsx or /pages/analytics-demo.tsx
export const getNextJsAnalyticsPageSnippet = async (componentPath: string) => {
  const router = await checkIfUsingAppOrPagesRouter();

  const getImport = (pathName: string) => {
    // Import path is two levels up from the app router's page directory.
    if (router === "app") {
      return path.normalize(`../../${componentPath}/${pathName}`);
    }

    // Import path is one level up from the pages router's page file.
    return path.normalize(`../${componentPath}/${pathName}`);
  };

  const snippet = `
import { AnalyticsDashboard } from '${getImport("analytics-dashboard")}'

export default function AnalyticsPage() {
  return (
    <AnalyticsDashboard />
  );
}
`;

  return snippet.trim();
};
