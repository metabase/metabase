import { useDispatch } from "metabase/redux";
import { downloadDashboardToPdf } from "metabase/redux/downloads";
import { Icon, Menu } from "metabase/ui";
import { getExportTabAsPdfButtonText } from "metabase/visualizations/lib/save-dashboard-pdf";
import type { Dashboard } from "metabase-types/api";

export const ExportPdfMenuItem = ({
  dashboard,
  loading,
  disabled,
}: {
  dashboard: Dashboard;
  loading?: boolean;
  disabled?: boolean;
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
      disabled={loading || disabled}
      style={loading ? { cursor: "wait" } : undefined}
    >
      {getExportTabAsPdfButtonText(dashboard.tabs)}
    </Menu.Item>
  );
};
