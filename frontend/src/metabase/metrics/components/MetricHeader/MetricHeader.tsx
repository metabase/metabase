import type { ReactNode } from "react";

import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/data-studio/common/components/PaneHeader";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Flex, Group } from "metabase/ui";
import type { Card } from "metabase-types/api";

import type { MetricUrls } from "../../types";

import { MetricNameInput } from "./MetricNameInput";
import { MetricTabs } from "./MetricTabs";
import { MetricToolbar } from "./MetricToolbar";

interface MetricHeaderProps {
  card: Card;
  urls: MetricUrls;
  actions?: ReactNode;
  breadcrumbs?: ReactNode;
  showAppSwitcher?: boolean;
  showDataStudioLink: boolean;
}

export function MetricHeader({
  card,
  urls,
  actions,
  breadcrumbs,
  showAppSwitcher = false,
  showDataStudioLink,
}: MetricHeaderProps) {
  return (
    <PaneHeader
      data-testid="metric-header"
      showAppSwitcher={showAppSwitcher}
      title={
        <Flex align="center" gap="sm">
          {card.can_write ? (
            <MetricNameInput card={card} />
          ) : (
            <PanelHeaderTitle>{card.name}</PanelHeaderTitle>
          )}
          <PLUGIN_MODERATION.EntityModerationIcon
            moderationReviews={card.moderation_reviews}
          />
        </Flex>
      }
      icon="metric"
      tabs={<MetricTabs card={card} urls={urls} />}
      actions={
        <Group wrap="nowrap" align="center">
          {actions}
          <MetricToolbar
            card={card}
            urls={urls}
            showDataStudioLink={showDataStudioLink}
          />
        </Group>
      }
      breadcrumbs={breadcrumbs}
    />
  );
}
