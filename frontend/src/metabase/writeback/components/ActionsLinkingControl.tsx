import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import { SelectList } from "metabase/components/select-list";

import * as Q_DEPRECATED from "metabase/lib/query";

import { SavedCard, StructuredDatasetQuery } from "metabase-types/types/Card";
import { DashboardWithCards, DashCard } from "metabase-types/types/Dashboard";

type StructuredQuerySavedCard = SavedCard<StructuredDatasetQuery>;
type StructuredQueryDashCard = DashCard<StructuredQuerySavedCard>;

interface Props {
  card: DashCard;
  dashboard: DashboardWithCards;
  onUpdateVisualizationSettings: (settings: Record<string, unknown>) => void;
}

function ActionsLinkingControl({
  card,
  dashboard,
  onUpdateVisualizationSettings,
}: Props) {
  const connectedDashCardId =
    card.visualization_settings["actions.linked_card"];

  const suitableDashCards = dashboard.ordered_cards.filter(dashCard =>
    Q_DEPRECATED.isStructured(dashCard.card.dataset_query),
  ) as StructuredQueryDashCard[];

  return (
    <PopoverWithTrigger
      triggerElement={
        <Tooltip tooltip={t`Connect table`}>
          <Icon name="bolt" size={16} />
        </Tooltip>
      }
    >
      <SelectList>
        {suitableDashCards.map(dashCard => (
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          <SelectList.Item
            key={dashCard.id}
            name={dashCard.card.name}
            icon="table"
            isSelected={dashCard.id === connectedDashCardId}
            onSelect={() =>
              onUpdateVisualizationSettings({
                "actions.linked_card": dashCard.id,
              })
            }
          />
        ))}
      </SelectList>
    </PopoverWithTrigger>
  );
}

export default ActionsLinkingControl;
