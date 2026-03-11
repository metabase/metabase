import { useDispatch } from "metabase/lib/redux";
import { downloadDashboardToPdf } from "metabase/redux/downloads";
import { Icon, Menu } from "metabase/ui";
import { getExportTabAsPdfButtonText } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

export const ExportPdfMenuItem = ({
  dashboard,
  loading,
}: {
  dashboard: Dashboard;
  loading?: boolean;
}) => {
  const dispatch = useDispatch();

  const handleClick = async () => {
    dispatch(
      downloadDashboardToPdf({
        dashboard,
        id: Date.now(),
      }),
    );
  };

  return (
    <Menu.Item
      data-testid="dashboard-export-pdf-button"
      leftSection={<Icon name="document" />}
      onClick={handleClick}
      disabled={loading}
      style={loading ? { cursor: "wait" } : undefined}
    >
      {getExportTabAsPdfButtonText(dashboard.tabs)}
    </Menu.Item>
  );
};
