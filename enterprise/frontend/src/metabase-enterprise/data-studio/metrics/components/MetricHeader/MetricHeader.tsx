import type { ReactNode } from "react";

import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import type { Card } from "metabase-types/api";

import { MetricMoreMenu } from "./MetricMoreMenu";
import { MetricNameInput } from "./MetricNameInput";
import { MetricTabs } from "./MetricTabs";

type MetricHeaderProps = {
  card: Card;
  actions?: ReactNode;
};

export function MetricHeader({ card, actions }: MetricHeaderProps) {
  return (
    <PaneHeader
      data-testid="metric-header"
      title={
        card.can_write ? (
          <MetricNameInput card={card} />
        ) : (
          <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
        )
      }
      icon="metric"
      menu={<MetricMoreMenu card={card} />}
      tabs={<MetricTabs card={card} />}
      actions={actions}
    />
  );
}
