import { t } from "ttag";
import _ from "underscore";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { Link } from "metabase/common/components/Link";
import { getTranslatedEntityName } from "metabase/common/utils/model-names";
import { useGetIcon } from "metabase/hooks/use-icon";
import { Flex, Group, Icon, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isQuestionDashCard } from "metabase/utils/dashboard";
import type { CardType, Dashboard } from "metabase-types/api";

const MODEL_BY_CARD_TYPE = {
  question: "card",
  model: "dataset",
  metric: "metric",
} as const satisfies Record<CardType, string>;

const CARD_TYPE_ORDER: CardType[] = ["question", "model", "metric"];

/** The saved questions, models, and metrics on a dashboard, across all tabs */
export const DashboardContentsSection = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const getIcon = useGetIcon();
  // A card can sit on several tabs or more than once on one tab
  const cards = _.uniq(
    dashboard.dashcards
      .filter(isQuestionDashCard)
      .map((dashcard) => dashcard.card),
    false,
    (card) => card.id,
  ).sort(
    (a, b) =>
      CARD_TYPE_ORDER.indexOf(a.type) - CARD_TYPE_ORDER.indexOf(b.type) ||
      a.name.localeCompare(b.name),
  );

  return (
    <SidebarSection title={t`Contents`}>
      <DetailsTable>
        {cards.length === 0 ? (
          <DetailsRow
            label={t`This dashboard doesn't have any questions, models, or metrics.`}
            value=""
            spanLabel
          />
        ) : (
          cards.map((card) => {
            const model = MODEL_BY_CARD_TYPE[card.type];

            return (
              <Flex
                key={card.id}
                px="lg"
                py="sm"
                gap="md"
                align="center"
                justify="space-between"
              >
                <Link to={Urls.card(card)} variant="brand">
                  <Group gap="sm" wrap="nowrap">
                    <Icon c="text-primary" {...getIcon({ ...card, model })} />
                    <Text lh="1.25rem" c="inherit">
                      {card.name}
                    </Text>
                  </Group>
                </Link>
                <Text c="text-secondary" style={{ flexShrink: 0 }}>
                  {getTranslatedEntityName(model)}
                </Text>
              </Flex>
            );
          })
        )}
      </DetailsTable>
    </SidebarSection>
  );
};
