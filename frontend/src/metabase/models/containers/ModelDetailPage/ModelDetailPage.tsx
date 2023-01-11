import React, { useEffect, useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { connect } from "react-redux";

import * as Urls from "metabase/lib/urls";
import { useOnMount } from "metabase/hooks/use-on-mount";

import { getMetadata } from "metabase/selectors/metadata";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import title from "metabase/hoc/Title";

import { loadMetadataForCard } from "metabase/questions/actions";

import ModelDetailPageView from "metabase/models/components/ModelDetailPage";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";

import type { Card, Collection } from "metabase-types/api";
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

type ToastOpts = {
  notify: {
    message: JSX.Element;
    undo: boolean;
  };
};

type DispatchProps = {
  loadMetadataForCard: (card: LegacyCardType) => void;
  fetchTableForeignKeys: (params: { id: Table["id"] }) => void;
  onChangeModel: (card: Card) => void;
  onChangeCollection: (
    card: Card,
    collection: Collection,
    opts: ToastOpts,
  ) => void;
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
  onChangeModel: (card: Card) => Questions.actions.update(card),
  onChangeCollection: Questions.objectActions.setCollection,
};

function ModelDetailPage({
  model,
  loadMetadataForCard,
  fetchTableForeignKeys,
  onChangeModel,
  onChangeCollection,
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

  const handleCollectionChange = useCallback(
    (collection: Collection) => {
      onChangeCollection(model.card() as Card, collection, {
        notify: {
          message: <QuestionMoveToast collectionId={collection.id} isModel />,
          undo: false,
        },
      });
    },
    [model, onChangeCollection],
  );

  return (
    <ModelDetailPageView
      model={model}
      mainTable={mainTable}
      onChangeModel={onChangeModel}
      onChangeCollection={handleCollectionChange}
    />
  );
}

function getPageTitle({ modelCard }: Props) {
  return modelCard?.name;
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
  title(getPageTitle),
)(ModelDetailPage);
