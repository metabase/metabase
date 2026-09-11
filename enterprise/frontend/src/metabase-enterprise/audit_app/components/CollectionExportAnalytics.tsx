import { t } from "ttag";

import { ActionIcon, Box, Icon, Text, Tooltip } from "metabase/ui";

import { ANALYTICS_EXPORT_CACHE_KEY, useExportAnalyticsMutation } from "../api";

export function CollectionExportAnalytics() {
  const [exportAnalytics, { isLoading }] = useExportAnalyticsMutation({
    fixedCacheKey: ANALYTICS_EXPORT_CACHE_KEY,
  });

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
          disabled={isLoading}
        >
          <Icon name="download" />
        </ActionIcon>
      </span>
    </Tooltip>
  );
}
