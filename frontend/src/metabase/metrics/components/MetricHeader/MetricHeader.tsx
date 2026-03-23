import type { ReactNode } from "react";

import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/data-studio/common/components/PaneHeader";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../types";

import { MetricMoreMenu } from "./MetricMoreMenu";
import { MetricNameInput } from "./MetricNameInput";
import { MetricTabs } from "./MetricTabs";

interface MetricHeaderProps {
  card: Card;
  urls: MetricUrls;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  showAppSwitcher?: boolean;
}

export function MetricHeader({
  card,
  urls,
  actions,
  breadcrumbs,
  showAppSwitcher = false,
}: MetricHeaderProps) {
  return (
    <PaneHeader
      data-testid="metric-header"
      showAppSwitcher={showAppSwitcher}
      title={
        card.can_write ? (
          <MetricNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
      icon="metric"
      menu={<MetricMoreMenu card={card} urls={urls} />}
      tabs={<MetricTabs card={card} urls={urls} />}
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
