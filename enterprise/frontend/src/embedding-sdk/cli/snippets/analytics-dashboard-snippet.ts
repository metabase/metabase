import { SDK_PACKAGE_NAME } from "../constants/config";

export const getAnalyticsDashboardSnippet = (instanceUrl: string) => `
import { InteractiveDashboard } from '${SDK_PACKAGE_NAME}'

import { ThemeSwitcher } from './theme-switcher'

export const AnalyticsDashboard = (props) => {
  const { dashboardId } = props;

  const editLink = \`${instanceUrl}/dashboard/\${dashboardId}\`

  return (
    <div>
      <div className="analytics-header">
        {/** TODO: Remove. This is just a link to edit the dashboard in Metabase for your convenience. */}
        <a href={editLink} target="_blank">
          Edit this dashboard
        </a>

        <ThemeSwitcher />
      </div>

      <InteractiveDashboard dashboardId={dashboardId} withTitle withDownloads />
    </div>
  );
}
`;
