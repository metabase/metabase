import React from "react";
import type { Location } from "history";

import * as Urls from "metabase/lib/urls";
import Models from "metabase/entities/questions";

import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";

import ActionCreator from "../ActionCreator";

interface OwnProps {
  location: Location;
  params: {
    slug: string;
    actionId?: string;
  };
  onClose: () => void;
}

interface ModelLoaderProps {
  model: Card;
}

type Props = OwnProps & ModelLoaderProps;

function ActionCreatorRoute({ model, params, onClose }: Props) {
  const { slug, actionId } = params;
  const modelId = Urls.extractEntityId(slug);
  const databaseId = model.database_id || model.dataset_query.database;
  return (
    <ActionCreator
      actionId={actionId}
      modelId={modelId}
      databaseId={databaseId}
      onClose={onClose}
    />
  );
}

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

export default Models.load({
  id: getModelId,
  entityAlias: "model",
})(ActionCreatorRoute);
