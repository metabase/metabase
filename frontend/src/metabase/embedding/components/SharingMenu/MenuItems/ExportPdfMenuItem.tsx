import { t } from "ttag";

import { useDispatch } from "metabase/redux";
import { downloadDashboardToPdf } from "metabase/redux/downloads";
import { Box, Icon, Menu, Tooltip } from "metabase/ui";
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

  const menuItem = (
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

  if (!disabled) {
    return menuItem;
  }

  // The natively disabled button swallows hover events, so the tooltip must
  // anchor to a wrapper that still receives them (same trick as ToolbarButton).
  return (
    <Tooltip label={t`Dashboard is empty`}>
      <Box>{menuItem}</Box>
    </Tooltip>
  );
};
