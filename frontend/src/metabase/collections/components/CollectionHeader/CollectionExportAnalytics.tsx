import { t } from "ttag";

import { useExportAnalyticsMutation } from "metabase/api";
import { useSelector } from "metabase/redux";
import { hasActiveExport } from "metabase/redux/analytics-export";
import { Box, Button, Icon, Text, Tooltip } from "metabase/ui";

import S from "./CollectionHeaderButton.module.css";

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
        <Button
          className={S.headerButton}
          variant="subtle"
          aria-label={t`Export analytics`}
          leftSection={<Icon name="download" size={20} />}
          onClick={handleExport}
          disabled={isExporting}
        />
      </span>
    </Tooltip>
  );
}
