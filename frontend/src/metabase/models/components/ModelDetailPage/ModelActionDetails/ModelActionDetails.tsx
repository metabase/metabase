import React from "react";
import { t } from "ttag";
import { connect } from "react-redux";
import _ from "underscore";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import Icon from "metabase/components/Icon";

import Actions from "metabase/entities/actions";
import { humanize } from "metabase/lib/formatting";
import { hasImplicitActions, isImplicitAction } from "metabase/writeback/utils";

import type { WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import {
  EmptyStateContainer,
  EmptyStateTitle,
} from "../ModelDetailPage.styled";
import { ActionListItem, ActionTitle } from "./ModelActionDetails.styled";

const mapDispatchToProps = {
  enableImplicitActionsForModel: Actions.actions.enableImplicitActionsForModel,
};

interface Props {
  modelId: number;
  actions: WritebackAction[];
  enableImplicitActionsForModel: (modelId: number) => void;
}

function ModelActionDetails({
  actions,
  modelId,
  enableImplicitActionsForModel,
}: Props) {
  const handleCreateImplicitActions = async () => {
    await enableImplicitActionsForModel(modelId);
  };

  if (!actions?.length) {
    return (
      <EmptyStateContainer>
        <EmptyStateTitle>{t`This model does not have any actions yet.`}</EmptyStateTitle>
        <Button onClick={handleCreateImplicitActions} icon="add">
          {t`Enable implicit actions`}
        </Button>
        <AddActionButton modelId={modelId} />
      </EmptyStateContainer>
    );
  }

  const modelHasImplicitActions = hasImplicitActions(actions);

  return (
    <>
      {!modelHasImplicitActions && modelId && (
        <Button onClick={handleCreateImplicitActions} icon="add">
          {t`Enable implicit actions`}
        </Button>
      )}
      <AddActionButton modelId={modelId} />
      <ul>
        {actions.map(action => (
          <li key={action.id}>
            <ActionListItem
              to={`/action/${action.id}`}
              disabled={isImplicitAction(action)}
            >
              <Icon name="insight" />
              <ActionTitle>
                {action.name ?? humanize(action.slug ?? "")}
              </ActionTitle>
            </ActionListItem>
          </li>
        ))}
      </ul>
    </>
  );
}

const AddActionButton = ({ modelId }: { modelId: number }) => (
  <Button
    as={Link}
    to={`/action/create?model-id=${modelId}`}
    icon="add"
  >{t`Create a new action`}</Button>
);

export default Actions.loadList(
  {
    query: (state: State, props: { modelId?: number | null }) => ({
      "model-id": props?.modelId,
    }),
  },
  connect(null, mapDispatchToProps),
)(ModelActionDetails);
