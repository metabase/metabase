import React from "react";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import Tooltip from "metabase/components/Tooltip";
import { SelectList } from "metabase/components/select-list";

import * as Q_DEPRECATED from "metabase/lib/query";

import { Card, StructuredDatasetQuery } from "metabase-types/types/Card";
import { DashboardWithCards, DashCard } from "metabase-types/types/Dashboard";
import Metadata from "metabase-lib/lib/metadata/Metadata";

type StructuredQueryDashCard = DashCard<StructuredDatasetQuery>;

interface Props {
  card: DashCard;
  dashboard: DashboardWithCards;
  metadata: Metadata;
  onUpdateVisualizationSettings: (settings: Record<string, unknown>) => void;
}

function ActionsLinkingControl({
  card,
  dashboard,
  metadata,
  onUpdateVisualizationSettings,
}: Props) {
  const connectedTableId = card.visualization_settings["actions.linked_table"];

  const suitableDashCards = dashboard.ordered_cards.filter(dashCard =>
    Q_DEPRECATED.isStructured(dashCard.card.dataset_query),
  );

  const suitableTables = suitableDashCards
    .map(dashCard => (dashCard as StructuredQueryDashCard).card)
    .map(card => card.dataset_query.query["source-query"])
    .map(tableId => metadata.table(tableId))
    .filter(Boolean);

  return (
    <PopoverWithTrigger
      triggerElement={
        <Tooltip tooltip={t`Connect table`}>
          <Icon name="bolt" size={16} />
        </Tooltip>
      }
    >
      <SelectList>
        {suitableTables.map(table => (
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          <SelectList.Item
            key={table.id}
            name={table.displayName()}
            icon="table"
            isSelected={table.id === connectedTableId}
            onSelect={() =>
              onUpdateVisualizationSettings({
                "actions.linked_table": table.id,
              })
            }
          />
        ))}
      </SelectList>
    </PopoverWithTrigger>
  );
}

export default ActionsLinkingControl;
