import { SDK_PACKAGE_NAME } from "../constants/config";
import type { DashboardInfo } from "../types/dashboard";

export const getAnalyticsDashboardSnippet = (
  instanceUrl: string,
  dashboards: DashboardInfo[],
) => `
import { useState } from 'react'
import { InteractiveDashboard } from '${SDK_PACKAGE_NAME}'

import { ThemeSwitcher } from './theme-switcher'

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
          </select>
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
