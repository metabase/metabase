import { t } from "ttag";

import { useExportAnalyticsMutation } from "metabase/api";
import { useSelector } from "metabase/redux";
import { hasActiveExport } from "metabase/redux/analytics-export";
import { ActionIcon, Box, Icon, Text, Tooltip } from "metabase/ui";

export function CollectionExportAnalytics() {
  const [exportAnalytics] = useExportAnalyticsMutation();
  const isExporting = useSelector(hasActiveExport);

  const handleExport = () => {
    exportAnalytics();
  };

  return (
    <Tooltip
      label={
        <Box ta="center">
          <Text size="sm" c="tooltip-text">
            {t`Export analytics content`}
          </Text>
          <Text size="sm" c="tooltip-text-secondary">
            {t`Download as .tar.gz for local development`}
          </Text>
        </Box>
      }
      position="bottom"
    >
      <span>
        <ActionIcon
          variant="viewHeader"
          size="2rem"
          aria-label={t`Export analytics`}
          onClick={handleExport}
          disabled={isExporting}
        >
          <Icon name="download" />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}
