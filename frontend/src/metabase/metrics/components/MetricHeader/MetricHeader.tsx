import type { ReactNode } from "react";

import {
  PaneHeader,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import type { MetricUrls } from "metabase/common/metrics/types";
import { NavOpenButton } from "metabase/nav/prototype/NavOpenButton";
import {
  isModernNav,
  useNavVariant,
} from "metabase/nav/prototype/use-nav-variant";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { Flex } from "metabase/ui";
import type { Card } from "metabase-types/api";

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
  const { variant } = useNavVariant();
  return (
    <PaneHeader
      data-testid="metric-header"
      showAppSwitcher={showAppSwitcher}
      // PROTOTYPE: main-app metric pages (no app switcher; Data Studio's have
      // one) carry "No top nav"'s open-nav button beside the breadcrumbs, and
      // center them on the nav's header (there's no top bar above them).
      breadcrumbsLeading={showAppSwitcher ? undefined : <NavOpenButton />}
      isBreadcrumbsAlignedWithNavHeader={
        !showAppSwitcher && isModernNav(variant)
      }
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
      menu={
        <MetricToolbar
          card={card}
          urls={urls}
          showDataStudioLink={showDataStudioLink}
        />
      }
      actions={actions}
      breadcrumbs={breadcrumbs}
    />
  );
}
