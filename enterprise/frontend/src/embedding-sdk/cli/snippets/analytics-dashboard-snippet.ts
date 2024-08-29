import { SDK_PACKAGE_NAME } from "../constants/config";
import type { DashboardInfo } from "../types/dashboard";

interface Options {
  instanceUrl: string;
  dashboards: DashboardInfo[];
  userSwitcherEnabled: boolean;
}

export const getAnalyticsDashboardSnippet = (options: Options) => {
  const { instanceUrl, dashboards, userSwitcherEnabled } = options;

  let imports = `import { ThemeSwitcher } from './theme-switcher'`;

  if (userSwitcherEnabled) {
    imports += `\nimport { UserSwitcher } from './user-switcher'`;
  }

  return `
import { useState, useContext } from 'react'
import { InteractiveDashboard } from '${SDK_PACKAGE_NAME}'
import { AnalyticsContext } from "./analytics-provider"

${imports}

export const AnalyticsDashboard = () => {
  const {email} = useContext(AnalyticsContext)
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
          </select>

          ${userSwitcherEnabled ? "<UserSwitcher />" : ""}
        </div>

        <div className="analytics-header-right">
          {/** TODO: Remove. This is just a link to edit the dashboard in Metabase for your convenience. */}
          <a href={editLink} target="_blank">
            Edit this dashboard
          </a>

          <ThemeSwitcher />
        </div>
      </div>

      {/** Reload the dashboard when user changes with the key prop */}
      <InteractiveDashboard dashboardId={dashboardId} withTitle withDownloads key={email} />
    </div>
  )
}

const DASHBOARDS = ${JSON.stringify(dashboards, null, 2)}
`;
};
