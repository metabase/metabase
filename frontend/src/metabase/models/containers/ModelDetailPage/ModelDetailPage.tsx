import React from "react";

import * as Urls from "metabase/lib/urls";

import Questions from "metabase/entities/questions";

import type { Card } from "metabase-types/api";
import type { State } from "metabase-types/store";

type OwnProps = {
  params: {
    id: string;
  };
};

type EntityLoaderProps = {
  modelCard: Card;
};

type Props = OwnProps & EntityLoaderProps;

function ModelDetailPage({ modelCard }: Props) {
  return <span>{modelCard?.name}</span>;
}

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.id);
}

export default Questions.load({ id: getModelId, entityAlias: "modelCard" })(
  ModelDetailPage,
);
