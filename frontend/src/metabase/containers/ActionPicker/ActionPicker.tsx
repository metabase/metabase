import React from "react";
import { t } from "ttag";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import Actions from "metabase/entities/actions";
import Questions from "metabase/entities/questions";

import type { Card, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Link from "metabase/core/components/Link";
import Button from "metabase/core/components/Button";
import {
  ModelTitle,
  ActionItem,
  ModelActionList,
  EmptyState,
  EmptyModelStateContainer,
} from "./ActionPicker.styled";

export default function ActionPicker({
  modelIds,
  onClick,
}: {
  modelIds: number[];
  onClick: (action: WritebackAction) => void;
}) {
  return (
    <div className="scroll-y">
      {modelIds.map(modelId => (
        <ConnectedModelActionPicker
          key={modelId}
          modelId={modelId}
          onClick={onClick}
        />
      ))}
      {!modelIds.length && (
        <EmptyState
          message={t`No models found`}
          action={t`Create new model`}
          link={"/model/new"}
        />
      )}
    </div>
  );
}

function ModelActionPicker({
  onClick,
  model,
  actions,
}: {
  onClick: (newValue: WritebackAction) => void;
  model: Card;
  actions: WritebackAction[];
}) {
  return (
    <ModelActionList>
      <ModelTitle>
        <Icon name="model" size={16} className="mr2" />
        {model.name}
      </ModelTitle>
      {actions?.length ? (
        <ul>
          {actions?.map(action => (
            <ActionItem onClick={() => onClick(action)} key={action.id}>
              {action.name}
            </ActionItem>
          ))}
        </ul>
      ) : (
        <EmptyModelStateContainer>
          <div>{t`There are no actions for this model`}</div>
          <Button
            as={Link}
            to={`/action/create?model-id=${model.id}`}
            borderless
          >
            {t`Create new action`}
          </Button>
        </EmptyModelStateContainer>
      )}
    </ModelActionList>
  );
}

const ConnectedModelActionPicker = _.compose(
  Questions.load({
    id: (state: State, props: { modelId?: number | null }) => props?.modelId,
    entityAlias: "model",
  }),
  Actions.loadList({
    query: (state: State, props: { modelId?: number | null }) => ({
      "model-id": props?.modelId,
    }),
  }),
)(ModelActionPicker);
