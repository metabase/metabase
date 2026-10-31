import { useMemo } from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EntityIcon } from "metabase/common/components/EntityIcon";
import { Link } from "metabase/common/components/Link";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Flex, Group, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { Card, CardType, Dashboard } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/dashboard";

const MODEL_BY_CARD_TYPE = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const satisfies Record<CardType, string>;

const CARD_TYPE_RANK: Record<CardType, number> = {
  question: 0,
  model: 1,
  metric: 2,
};

const byTypeThenName = (a: Card, b: Card) =>
  CARD_TYPE_RANK[a.type] - CARD_TYPE_RANK[b.type] ||
  a.name.localeCompare(b.name);

// A card the viewer cannot read arrives as `{ id }` only (see `UnreadableCard`),
// so it has nothing to show or open. A card can also sit on several tabs, or
// more than once on one tab.
const listedCards = (dashcards: Dashboard["dashcards"]) =>
  _.uniq(
    dashcards
      .filter(isQuestionDashCard)
      .map((dashcard) => dashcard.card)
      .filter(isReadableCard),
    false,
    (card) => card.id,
  ).sort(byTypeThenName);

export const DashboardContentsSection = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const getIcon = useGetIcon();
  const title = t`Contents`;
  const cards = useMemo(
    () => listedCards(dashboard.dashcards),
    [dashboard.dashcards],
  );

  return (
    <SidebarSection title={title}>
      <DetailsTable role="list" aria-label={title}>
        {cards.length === 0 && (
          <Text px="lg" py="sm" c="text-secondary">
            {t`This dashboard doesn't have any questions, models, or metrics.`}
          </Text>
        )}
        {cards.map((card) => {
          const model = MODEL_BY_CARD_TYPE[card.type];

          return (
            <Flex
              key={card.id}
              role="listitem"
              px="lg"
              py="sm"
              gap="md"
              align="center"
              justify="space-between"
            >
              <Link to={Urls.card(card)} variant="brand">
                <Group gap="sm" wrap="nowrap">
                  <EntityIcon
                    c="text-primary"
                    {...getIcon({ ...card, model })}
                  />
                  <Text lh="1.25rem" c="inherit">
                    {card.name}
                  </Text>
                </Group>
              </Link>
              <Text c="text-secondary" flex="0 0 auto">
                {getTranslatedEntityName(model)}
              </Text>
            </Flex>
          );
        })}
      </DetailsTable>
    </SidebarSection>
  );
};
