import { SDK_PACKAGE_NAME } from "../constants/config";
import type { DashboardInfo } from "../types/dashboard";

interface Options {
  instanceUrl: string;
  dashboards: DashboardInfo[];
  userSwitcherEnabled: boolean;
}

export const getAnalyticsDashboardSnippet = (options: Options) => {
  const { instanceUrl, dashboards, userSwitcherEnabled } = options;

  let leftHeaders = "";
  let imports = `import { ThemeSwitcher } from './theme-switcher'`;

  if (userSwitcherEnabled) {
    imports += `\nimport { UserSwitcher } from './user-switcher'`;
    leftHeaders += "\n<UserSwitcher />\n";
  }

  return `
import { useState } from 'react'
import { InteractiveDashboard } from '${SDK_PACKAGE_NAME}'

${imports}

export const AnalyticsDashboard = () => {
  const [dashboardId, setDashboardId] = useState(DASHBOARDS[0].id)

  const editLink = \`${instanceUrl}/dashboard/\${dashboardId}\`

  return (
    <div className="analytics-container">
      <div className="analytics-header">
        <div>
          <select
            className="dashboard-select"
            onChange={(e) => setDashboardId(e.target.value)}
          >
            {DASHBOARDS.map((dashboard) => (
              <option key={dashboard.id} value={dashboard.id}>
                {dashboard.name}
              </option>
            ))}
          </select>${leftHeaders}
        </div>

        <div className="analytics-header-right">
          {/** TODO: Remove. This is just a link to edit the dashboard in Metabase for your convenience. */}
          <a href={editLink} target="_blank">
            Edit this dashboard
          </a>

          <ThemeSwitcher />
        </div>
      </div>

      <InteractiveDashboard dashboardId={dashboardId} withTitle withDownloads />
    </div>
  )
}

const DASHBOARDS = ${JSON.stringify(dashboards, null, 2)}
`;
};
