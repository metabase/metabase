import { useMemo } from "react";
import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import type { MetricUrls } from "metabase/common/metrics/types";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getUserIsAdmin, getUserIsAnalyst } from "metabase/selectors/user";
import * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Card } from "metabase-types/api";

interface MetricTabsProps {
  card: Card;
  urls: MetricUrls;
}

export function MetricTabs({ card, urls }: MetricTabsProps) {
  const metadata = useSelector(getMetadata);
  const canSeeDependencies = useSelector(
    (state) => getUserIsAdmin(state) || getUserIsAnalyst(state),
  );
  const tabs = useMemo(
    () => getTabs(card, metadata, urls, canSeeDependencies),
    [card, metadata, urls, canSeeDependencies],
  );
  return <PaneHeaderTabs tabs={tabs} />;
}

function getTabs(
  card: Card,
  metadata: Metadata,
  urls: MetricUrls,
  canSeeDependencies: boolean,
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
