import { t } from "ttag";

import { useDispatch, useSelector } from "metabase/lib/redux";
import {
  exportAnalytics,
  hasActiveExport,
} from "metabase/redux/analytics-export";
import { Box, Text, Tooltip } from "metabase/ui";

import { CollectionHeaderButton } from "./CollectionHeader.styled";

export function CollectionExportAnalytics() {
  const dispatch = useDispatch();
  const isExporting = useSelector(hasActiveExport);

  const handleExport = () => {
    dispatch(exportAnalytics());
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
        <CollectionHeaderButton
          aria-label={t`Export analytics`}
          icon="download"
          iconSize={20}
          onClick={handleExport}
          disabled={isExporting}
        />
      </span>
    </Tooltip>
  );
}
