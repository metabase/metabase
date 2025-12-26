import { useMemo } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import CS from "metabase/css/core/index.css";
import { Box, Stack, Text } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { Dataset, RawSeries } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";

interface PreviewTabProps {
  dataset: Dataset | null;
  isLoading?: boolean;
}

export function PreviewTab({ dataset, isLoading }: PreviewTabProps) {
  const rawSeries: RawSeries = useMemo(() => {
    if (!dataset?.data || dataset.data.cols.length === 0) {
      return [];
    }

    return [
      {
        card: createMockCard({
          display: "table",
          visualization_settings: {},
        }),
        data: dataset.data,
      },
    ];
  }, [dataset?.data]);

  if (isLoading) {
    return <LoadingAndErrorWrapper loading />;
  }

  if (!dataset?.data || dataset.data.cols.length === 0) {
    return (
      <Stack h="100%" align="center" justify="center">
        <Text c="text-medium">{t`No data available`}</Text>
      </Stack>
    );
  }

  return (
    <Box h="100%" className={CS.relative}>
      <Visualization queryBuilderMode="dataset" rawSeries={rawSeries} />
    </Box>
  );
}
