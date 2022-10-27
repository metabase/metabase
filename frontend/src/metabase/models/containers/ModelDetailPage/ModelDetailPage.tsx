import React, { useEffect, useMemo, useState } from "react";
import _ from "underscore";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { getMetadata } from "metabase/selectors/metadata";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";

import { loadMetadataForCard } from "metabase/query_builder/actions";

import ModelDetailPageView from "metabase/models/components/ModelDetailPage";

import type { Card } from "metabase-types/api";
import type { Card as LegacyCardType } from "metabase-types/types/Card";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";

type OwnProps = {
  params: {
    slug: string;
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
  fetchTableForeignKeys: (params: { id: Table["id"] }) => void;
  onChangeModel: (card: Card) => void;
};

type Props = OwnProps & EntityLoaderProps & StateProps & DispatchProps;

function mapStateToProps(state: State, props: OwnProps & EntityLoaderProps) {
  const metadata = getMetadata(state);
  const model = new Question(props.modelCard, metadata);
  return { model };
}

const mapDispatchToProps = {
  loadMetadataForCard,
  fetchTableForeignKeys: Tables.actions.fetchForeignKeys,
  onChangeModel: Questions.actions.update,
};

function ModelDetailPage({
  model,
  loadMetadataForCard,
  fetchTableForeignKeys,
  onChangeModel,
}: Props) {
  const [hasFetchedTableMetadata, setHasFetchedTableMetadata] = useState(false);

  const mainTable = useMemo(
    () => (model.isStructured() ? model.query().sourceTable() : null),
    [model],
  );

  useOnMount(() => {
    loadMetadataForCard(model.card());
  });

  useEffect(() => {
    if (mainTable && !hasFetchedTableMetadata) {
      setHasFetchedTableMetadata(true);
      fetchTableForeignKeys({ id: mainTable.id });
    }
  }, [mainTable, hasFetchedTableMetadata, fetchTableForeignKeys]);

  return (
    <ModelDetailPageView
      model={model}
      mainTable={mainTable}
      onChangeModel={onChangeModel}
    />
  );
}

export default _.compose(
  Questions.load({
    id: (state: State, props: OwnProps) =>
      Urls.extractEntityId(props.params.slug),
    entityAlias: "modelCard",
  }),
  connect<StateProps, DispatchProps, OwnProps & EntityLoaderProps, State>(
    mapStateToProps,
    mapDispatchToProps,
  ),
)(ModelDetailPage);
