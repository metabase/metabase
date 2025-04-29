import type { DashboardInfo } from "../types/dashboard";
import { getSdkPackageName } from "../utils/snippets-helpers";

interface Options {
  dashboards: DashboardInfo[];
  userSwitcherEnabled: boolean;
  isNextJs: boolean;
}

export const getAnalyticsDashboardSnippet = (options: Options) => {
  const { dashboards, userSwitcherEnabled, isNextJs } = options;

  const sdkPackageName = getSdkPackageName({ isNextJs });

  let imports = `import { ThemeSwitcher } from './theme-switcher'`;

  if (userSwitcherEnabled) {
    imports += `\nimport { UserSwitcher } from './user-switcher'`;
  }

  return `
import { useState, useContext, useReducer } from 'react'
import { InteractiveDashboard, InteractiveQuestion } from '${sdkPackageName}'
import { AnalyticsContext } from "./analytics-provider"

${imports}

export const AnalyticsDashboard = () => {
  const {email, themeKey} = useContext(AnalyticsContext)
  const [dashboardId, setDashboardId] = useState(DASHBOARDS[0].id)

  const [isCreateQuestion, toggleCreateQuestion] = useReducer((s) => !s, false)

  const isDashboard = !isCreateQuestion

  return (
    <div className={\`analytics-root theme-\${themeKey}\`}>
      <div className="analytics-container">
        <div className="analytics-header">
          <div>
            ${userSwitcherEnabled ? "<UserSwitcher />" : ""}
          </div>

          <div className="analytics-header-right">
            {isDashboard && (
              <select
                className="dashboard-select"
                onChange={(e) => setDashboardId(Number(e.target.value))}
              >
                {DASHBOARDS.map((dashboard) => (
                  <option key={dashboard.id} value={dashboard.id}>
                    {dashboard.name}
                  </option>
                ))}
              </select>
            )}

            <a href="#!" onClick={toggleCreateQuestion}>
              {isCreateQuestion ? 'Back to dashboard' : 'Create Question'}
            </a>

            <ThemeSwitcher />
          </div>
        </div>

        {/** Reload the dashboard when user changes with the key prop */}
        {isDashboard && (
          <InteractiveDashboard
            dashboardId={dashboardId}
            withTitle
            withDownloads
            key={email}
          />
        )}

        {isCreateQuestion && <InteractiveQuestion questionId="new" />}
      </div>
    </div>
  )
}

const DASHBOARDS = ${JSON.stringify(dashboards, null, 2)}
`;
};
