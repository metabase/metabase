import React from "react";

import Icon from "metabase/components/Icon";

import Actions from "metabase/entities/actions";

import type { WritebackQueryAction } from "metabase-types/api";
import type Question from "metabase-lib/lib/Question";

import { ActionListItem, ActionTitle } from "./ModelActionDetails.styled";

interface Props {
  model: Question;
  actions: WritebackQueryAction[];
}

function ModelActionDetails({ actions }: Props) {
  return (
    <ul>
      {actions.map(action => (
        <li key={action.id}>
          <ActionListItem to={`/action/${action.id}`}>
            <Icon name="insight" />
            <ActionTitle>{action.name}</ActionTitle>
          </ActionListItem>
        </li>
      ))}
    </ul>
  );
}

export default Actions.loadList()(ModelActionDetails);
