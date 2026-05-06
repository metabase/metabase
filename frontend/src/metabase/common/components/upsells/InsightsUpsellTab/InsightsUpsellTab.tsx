import type { ReactNode } from "react";
import { t } from "ttag";

import { UpsellUsageAnalytics } from "metabase/common/components/upsells/UpsellUsageAnalytics";
import { Card, Flex, Icon, Text, Tooltip } from "metabase/ui";
import { roundFloat } from "metabase/utils/formatting";
import type { CardType } from "metabase-types/api";

import S from "./InsightsUpsellTab.module.css";

const AnalyticsTeaser = ({
  heading,
  body,
  trendPct,
  isUpBad,
}: {
  heading: ReactNode;
  body: ReactNode;
  trendPct: number;
  isUpBad?: boolean;
}) => {
  return (
    <Flex flex={1} px="md" py="sm" direction="column">
      <Text mb="sm">{heading}</Text>
      <Flex align="baseline" py="xs">
        <Text fz="1.75rem" fw="bold" mr="sm">
          {body}
        </Text>
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
      </Flex>
    </Flex>
  );
};

export const InsightsUpsellTab = ({
  model,
}: {
  /** 'Model' in the sense of 'type of thing', not in the sense of 'dataset' */
  model: "dashboard" | CardType;
}) => {
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
          body="12,345"
          trendPct={0.012}
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
          body="42"
          trendPct={-0.034}
        />
        <AnalyticsTeaser
          heading={
            <Flex align="center">
              <Icon name="clock" size={14} mr="sm" />
              {t`Avg. execution time`}
            </Flex>
          }
          body="8.6s"
          trendPct={0.53}
          isUpBad
        />
      </Card>

      <UpsellUsageAnalytics
        location={`${model}-sidesheet`}
        fullWidth
        maxWidth={"initial"}
      />
    </>
  );
};
