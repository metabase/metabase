import cx from "classnames";
import { t } from "ttag";

import {
  ActionIcon,
  Box,
  Flex,
  Icon,
  Skeleton,
  Text,
  Tooltip,
} from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import type { RawSeries } from "metabase-types/api";

import S from "./TableFlow.module.css";
import { useXrayChartSeries } from "./XrayGallery";
import type { XrayChart } from "./utils";

type XrayChartDetailProps = {
  chart: XrayChart;
  /** CSS height of the data table card. */
  tableHeight: string;
  onClose: () => void;
};

export function XrayChartDetail({
  chart,
  tableHeight,
  onClose,
}: XrayChartDetailProps) {
  const { rawSeries, error } = useXrayChartSeries(chart);
  const tableSeries: RawSeries | null =
    rawSeries?.map(({ card, data }) => ({
      card: {
        ...card,
        display: "table",
        visualization_settings: { "table.pivot": false },
      },
      data,
    })) ?? null;

  return (
    <>
      <div className={cx(S.card, S.detailChartCard)}>
        <Flex align="center" justify="space-between" gap="sm">
          <Text fw="bold" size="lg" truncate="end">
            {chart.card.name}
          </Text>
          <Tooltip label={t`Back to table`}>
            <ActionIcon
              variant="viewHeader"
              aria-label={t`Back to table`}
              onClick={onClose}
            >
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        </Flex>
        <Box className={S.chartArea}>
          <SeriesVisualization rawSeries={rawSeries} error={error} />
        </Box>
      </div>
      <div className={cx(S.card, S.tableCard)} style={{ height: tableHeight }}>
        <div className={S.tableArea}>
          <SeriesVisualization rawSeries={tableSeries} error={error} />
        </div>
      </div>
    </>
  );
}

function SeriesVisualization({
  rawSeries,
  error,
}: {
  rawSeries: RawSeries | null;
  error: string | null;
}) {
  if (error) {
    return (
      <Text p="md" c="text-secondary">
        {error}
      </Text>
    );
  }
  if (!rawSeries) {
    return <Skeleton h="100%" />;
  }
  return (
    <Visualization
      // "dataset" mode hides the object detail expander column, which can't open rows of an ad-hoc x-ray query
      queryBuilderMode="dataset"
      rawSeries={rawSeries}
      isQueryBuilder={false}
      showTitle={false}
    />
  );
}
