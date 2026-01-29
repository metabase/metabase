import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card } from "metabase-types/api";

type MetricTabsProps = {
  card: Card;
};

export function MetricTabs({ card }: MetricTabsProps) {
  const metadata = useSelector(getMetadata);
  const tabs = getTabs(card, metadata);
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(card: Card, metadata: Metadata): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`Overview`,
      to: Urls.dataStudioMetric(card.id),
    },
  ];

  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);
  if (queryInfo.isEditable) {
    tabs.push({
      label: t`Definition`,
      to: Urls.dataStudioMetricQuery(card.id),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: Urls.dataStudioMetricDependencies(card.id),
    });
  }

  const isCacheableQuestion =
    PLUGIN_CACHING.isGranularCachingEnabled() &&
    PLUGIN_CACHING.hasQuestionCacheSection(new Question(card));

  if (isCacheableQuestion) {
    tabs.push({
      label: t`Caching`,
      to: Urls.dataStudioMetricCaching(card.id),
    });
  }

  return tabs;
}
