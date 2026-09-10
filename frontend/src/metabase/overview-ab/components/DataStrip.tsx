import { useState } from "react";
import { t } from "ttag";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { MetricCardVisualization } from "metabase/common/data-studio/components/OverviewVisualization/OverviewVisualization";
import { Box, Button, Collapse, Group, Icon, Text } from "metabase/ui";
import type { Card } from "metabase-types/api";

type DataStripProps = {
  card: Card | undefined;
};

/** The entity's raw rows, collapsed by default so the query only runs on demand. */
export function DataStrip({ card }: DataStripProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data, isFetching } = useGetAdhocQueryQuery(
    isOpen && card ? card.dataset_query : skipToken,
  );

  return (
    <Box
      style={{ borderTop: "1px solid var(--mb-color-border)" }}
      data-testid="overview-ab-data-strip"
    >
      <Group px="md" py={4} gap="xs">
        <Button
          size="compact-xs"
          variant="subtle"
          disabled={!card}
          leftSection={
            <Icon name={isOpen ? "chevrondown" : "chevronright"} size={10} />
          }
          onClick={() => setIsOpen((previous) => !previous)}
        >
          {t`Data`}
        </Button>
        {data && (
          <Text size="xs" c="text-secondary">
            {t`${data.row_count} rows × ${data.data.cols.length} cols`}
          </Text>
        )}
      </Group>
      <Collapse in={isOpen}>
        <Box h={280} px="md" pb="sm">
          {card && (
            <MetricCardVisualization
              card={card}
              data={data}
              isLoading={isFetching}
            />
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
