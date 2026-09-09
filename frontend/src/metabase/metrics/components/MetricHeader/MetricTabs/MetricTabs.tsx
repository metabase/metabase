import { useMemo } from "react";
import { t } from "ttag";

import { useGetMetricQuery } from "metabase/api/metric";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import type { MetricUrls } from "metabase/common/metrics/types";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/current-user";
import { useMetadataProviderFactory } from "metabase/metadata-store";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

interface MetricTabsProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricTabs({ card, urls }: MetricTabsProps) {
  const getMetadataProvider = useMetadataProviderFactory();
  const { data: metric } = useGetMetricQuery(card.id);
  const hasDimensions =
    metric?.dimensions != null && metric.dimensions.length > 0;
  const canSeeDependencies = useSelector(
    (state) => getUserIsAdmin(state) || getUserIsAnalyst(state),
  );
  const query = useMemo(
    () =>
      Lib.fromJsQuery(
        getMetadataProvider(card.dataset_query.database),
        card.dataset_query,
      ),
    [card, getMetadataProvider],
  );
  const tabs = useMemo(
    () => getTabs(card, query, urls, hasDimensions, canSeeDependencies),
    [card, query, urls, hasDimensions, canSeeDependencies],
  );
  return <PillTabNavigation tabs={tabs} />;
}

function getTabs(
  card: Card,
  query: Lib.Query,
  urls: MetricUrls,
  hasDimensions: boolean,
  canSeeDependencies: boolean,
): PillTab[] {
  const tabs: PillTab[] = [
    {
      label: t`About`,
      to: urls.about(card.id),
    },
  ];

  const queryInfo = Lib.queryDisplayInfo(query);

  if (queryInfo.isEditable) {
    if (isNumericMetric(card) && hasDimensions) {
      tabs.push({
        label: t`Overview`,
        to: urls.overview(card.id),
      });
    }

    tabs.push({
      label: t`Definition`,
      to: urls.query(card.id),
    });

    tabs.push({
      label: t`Dimensions`,
      to: urls.dimensions(card.id),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled && canSeeDependencies) {
    tabs.push({
      label: t`Dependencies`,
      to: urls.dependencies(card.id),
    });
  }

  tabs.push({
    label: t`History`,
    to: urls.history(card.id),
  });

  return tabs;
}
