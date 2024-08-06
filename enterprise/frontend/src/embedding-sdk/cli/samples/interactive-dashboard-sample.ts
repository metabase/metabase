import { SDK_PACKAGE_NAME } from "embedding-sdk/cli/constants/config";

export const getInteractiveDashboardSample = (instanceUrl: string) => `
import { MetabaseProvider } from '${SDK_PACKAGE_NAME}'

const MetabaseInteractiveDashboard = (props) => {
  const { dashboardId } = props;

  const editLink = "${instanceUrl}/dashboard/\${dashboardId}"

  return (
    <div>
      <InteractiveDashboard
        dashboardId={\${dashboardId}}
        withTitle
        withDownloads
      />

      <div>
        <a href={editLink}>Edit this dashboard</a>
      </div>
    </div>
  );
}
`;
