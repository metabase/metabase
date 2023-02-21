import React, { useEffect } from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import _ from "underscore";
import type { LocationDescriptor } from "history";

import * as Urls from "metabase/lib/urls";
import Actions from "metabase/entities/actions";
import Models from "metabase/entities/questions";

import type { Card, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import ActionCreator from "../ActionCreator";

interface OwnProps {
  params: {
    slug: string;
    actionId?: string;
  };
  onClose: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

interface EntityLoaderProps {
  action?: WritebackAction;
  model: Card;
  loading?: boolean;
}

interface DispatchProps {
  onChangeLocation: (location: LocationDescriptor) => void;
}

type ActionCreatorModalProps = OwnProps & EntityLoaderProps & DispatchProps;

const mapDispatchToProps = {
  onChangeLocation: replace,
};

function ActionCreatorModal({
  action,
  model,
  params,
  loading,
  onClose,
  onChangeLocation,
}: ActionCreatorModalProps) {
  const actionId = Urls.extractEntityId(params.actionId);
  const modelId = Urls.extractEntityId(params.slug);
  const databaseId = model.database_id || model.dataset_query.database;

  useEffect(() => {
    if (loading === false) {
      const notFound = params.actionId && !action;
      if (notFound || action?.archived) {
        const nextLocation = Urls.modelDetail(model, "actions");
        onChangeLocation(nextLocation);
      }
    }
    // We only need to run this once, when the action is fetched
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <ActionCreator
      actionId={actionId}
      modelId={modelId}
      databaseId={databaseId}
      onClose={onClose}
    />
  );
}

function getActionId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.actionId);
}

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

export default _.compose(
  Models.load({
    id: getModelId,
    entityAlias: "model",
  }),
  Actions.load({ id: getActionId, loadingAndErrorWrapper: false }),
  connect(null, mapDispatchToProps),
)(ActionCreatorModal);
