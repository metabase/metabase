import { useMemo } from "react";
import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import { isNumericMetric } from "metabase/metrics/utils/validation";
import { PLUGIN_CACHING, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../../types";

interface MetricTabsProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricTabs({ card, urls }: MetricTabsProps) {
  const metadata = useSelector(getMetadata);
  const tabs = useMemo(
    () => getTabs(card, metadata, urls),
    [card, metadata, urls],
  );
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(
  card: Card,
  metadata: Metadata,
  urls: MetricUrls,
): PaneHeaderTab[] {
  const tabs: PaneHeaderTab[] = [
    {
      label: t`About`,
      to: urls.about(card.id),
    },
  ];

  const query = Lib.fromJsQueryAndMetadata(metadata, card.dataset_query);
  const queryInfo = Lib.queryDisplayInfo(query);

  if (queryInfo.isEditable) {
    if (isNumericMetric(card)) {
      tabs.push({
        label: t`Overview`,
        to: urls.overview(card.id),
      });
    }
    tabs.push({
      label: t`Definition`,
      to: urls.query(card.id),
    });
  }

  if (PLUGIN_DEPENDENCIES.isEnabled) {
    tabs.push({
      label: t`Dependencies`,
      to: urls.dependencies(card.id),
    });
  }

  const isCacheableQuestion =
    PLUGIN_CACHING.isGranularCachingEnabled() &&
    PLUGIN_CACHING.hasQuestionCacheSection(new Question(card));

  if (isCacheableQuestion) {
    tabs.push({
      label: t`Caching`,
      to: urls.caching(card.id),
    });
  }

  tabs.push({
    label: t`History`,
    to: urls.history(card.id),
  });

  return tabs;
}
