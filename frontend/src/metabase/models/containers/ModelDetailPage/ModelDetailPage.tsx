import React from "react";
import _ from "underscore";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { getMetadata } from "metabase/selectors/metadata";
import Questions from "metabase/entities/questions";

import { loadMetadataForCard } from "metabase/query_builder/actions";

import ModelDetailPageView from "metabase/models/components/ModelDetailPage";

import type { Card } from "metabase-types/api";
import type { Card as LegacyCardType } from "metabase-types/types/Card";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/lib/Question";

type OwnProps = {
  params: {
    id: string;
  };
};

type EntityLoaderProps = {
  modelCard: Card;
};

type StateProps = {
  model: Question;
};

type DispatchProps = {
  loadMetadataForCard: (card: LegacyCardType) => void;
};

type Props = OwnProps & EntityLoaderProps & StateProps & DispatchProps;

function mapStateToProps(state: State, props: OwnProps & EntityLoaderProps) {
  const metadata = getMetadata(state);
  const model = new Question(props.modelCard, metadata);
  return { model };
}

const mapDispatchToProps = {
  loadMetadataForCard,
};

function ModelDetailPage({ model }: Props) {
  useOnMount(() => {
    loadMetadataForCard(model.card());
  });

  return <ModelDetailPageView model={model} />;
}

export default _.compose(
  Questions.load({
    id: (state: State, props: OwnProps) =>
      Urls.extractEntityId(props.params.id),
    entityAlias: "modelCard",
  }),
  connect<StateProps, DispatchProps, OwnProps & EntityLoaderProps, State>(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(ModelDetailPage);
