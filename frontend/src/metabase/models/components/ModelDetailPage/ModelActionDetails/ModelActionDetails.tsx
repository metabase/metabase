import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

import Actions from "metabase/entities/actions";
import { humanize } from "metabase/lib/formatting";

import type { ModelAction } from "metabase-types/api";
import type { State } from "metabase-types/store";
import type Question from "metabase-lib/lib/Question";

import {
  EmptyStateContainer,
  EmptyStateTitle,
} from "../ModelDetailPage.styled";
import { ActionListItem, ActionTitle } from "./ModelActionDetails.styled";

interface Props {
  model: Question;
  actions: ModelAction[];
}

function ModelActionDetails({ actions }: Props) {
  if (!actions?.length) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model does not have any actions yet.`}</EmptyStateTitle>
        <Button
          as={Link}
          to={`/action/create`}
          icon="add"
        >{t`Create a new action`}</Button>
      </EmptyStateContainer>
    );
  }

  return (
    <ul>
      {actions.map(action => (
        <li key={action.id}>
          <ActionListItem to={`/action/${action.action_id}`}>
            <Icon name="insight" />
            <ActionTitle>{action.name ?? humanize(action.slug)}</ActionTitle>
          </ActionListItem>
        </li>
      ))}
    </ul>
  );
}

export default Actions.loadList({
  query: (state: State, props: { modelId?: number | null }) => ({
    modelId: props?.modelId,
  }),
})(ModelActionDetails);
