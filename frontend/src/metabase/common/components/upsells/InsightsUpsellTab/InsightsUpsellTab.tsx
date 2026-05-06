import type { ReactNode } from "react";
import { t } from "ttag";

import { useGetAnalyticsTeaserQuery } from "metabase/api/activity";
import { UpsellUsageAnalytics } from "metabase/common/components/upsells/UpsellUsageAnalytics";
import { Card, Flex, Icon, Text, Tooltip } from "metabase/ui";
import { formatNumber, roundFloat } from "metabase/utils/formatting";
import type { AnalyticsTeaserResponse, CardType } from "metabase-types/api";

import S from "./InsightsUpsellTab.module.css";

// TODO: Maybe use "metabase/query_builder/components/view/ExecutionTime/utils"?
const formatDuration = (time: number): string => {
  if (time < 1000) {
    return t`${time}ms`;
  }

  return t`${(time / 1000).toFixed(1)}s`;
};

const AnalyticsTeaser = ({
  heading,
  value,
  trendPct,
  isUpBad,
}: {
  heading: ReactNode;
  value: ReactNode;
  trendPct: number | null;
  isUpBad?: boolean;
}) => {
  return (
    <Flex flex="1 0 0" px="md" py="sm" direction="column">
      <Text mb="sm">{heading}</Text>
      <Flex align="baseline" py="xs">
        <Text fz="1.75rem" fw="bold" mr="sm">
          {value}
        </Text>
        {trendPct ? (
          <>
            <Icon
              name={trendPct > 0 ? "arrow_up" : "arrow_down"}
              c={trendPct > 0 && !isUpBad ? "success" : "error"}
              size={12}
              mr="xs"
            />
            <Text c={trendPct > 0 && !isUpBad ? "success" : "error"} fw="bold">
              {roundFloat(trendPct * 100)}
              {"%"}
            </Text>
          </>
        ) : (
          <Text>&nbsp;</Text>
        )}
      </Flex>
    </Flex>
  );
};

const getPctChange = (curr: number, prev: number | null): number | null => {
  if (!prev) {
    return null;
  }
  return (curr - prev) / prev;
};

const AnalyticsSection = ({
  recent_view_count,
  recent_view_count_prev,
  visitor_count,
  visitor_count_prev,
  query_average_duration,
  query_average_duration_prev,
}: AnalyticsTeaserResponse) => {
  if (!recent_view_count || !visitor_count) {
    return null;
  }

  return (
    <>
      <Flex justify="space-between" mb="xs">
        <Text fw="bold">{t`Analytics`}</Text>
        <Text c="text-secondary">{t`Last 30 days`}</Text>
      </Flex>
      <Card mb="lg" withBorder shadow="xs" p={0} className={S.teasers}>
        <AnalyticsTeaser
          heading={
            <Flex align="center">
              <Icon name="popular" size={14} mr="sm" />
              {t`Views`}
            </Flex>
          }
          value={formatNumber(recent_view_count)}
          trendPct={getPctChange(recent_view_count, recent_view_count_prev)}
        />
        <AnalyticsTeaser
          heading={
            <Flex align="center">
              <Icon name="group" size={14} mr="sm" />
              {t`Unique visitors`}
              <Tooltip
                label={t`Does not include anonymous views from embedded questions or dashboards.`}
              >
                <Icon name="info" c="text-secondary" size={12} ml="xs" />
              </Tooltip>
            </Flex>
          }
          value={formatNumber(visitor_count)}
          trendPct={getPctChange(visitor_count, visitor_count_prev)}
        />
        {query_average_duration != null && (
          <AnalyticsTeaser
            heading={
              <Flex align="center">
                <Icon name="clock" size={14} mr="sm" />
                {t`Avg. execution time`}
              </Flex>
            }
            value={formatDuration(roundFloat(query_average_duration, 1))}
            trendPct={getPctChange(
              query_average_duration,
              query_average_duration_prev,
            )}
            isUpBad
          />
        )}
      </Card>
    </>
  );
};

export const InsightsUpsellTab = ({
  model,
  modelId,
}: {
  /** 'Model' in the sense of 'type of thing', not in the sense of 'dataset' */
  model: "dashboard" | CardType;
  modelId: string | number;
}) => {
  const { data } = useGetAnalyticsTeaserQuery(
    { model: model === "dashboard" ? model : "card", model_id: +modelId },
    { refetchOnMountOrArgChange: true },
  );
  return (
    <>
      {data && <AnalyticsSection {...data} />}
      <UpsellUsageAnalytics
        location={`${model}-sidesheet`}
        fullWidth
        maxWidth={"initial"}
      />
    </>
  );
};
