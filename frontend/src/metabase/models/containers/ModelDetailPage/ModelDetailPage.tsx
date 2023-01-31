import React, { useEffect, useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import type { Location, LocationDescriptor } from "history";

import * as Urls from "metabase/lib/urls";
import { useOnMount } from "metabase/hooks/use-on-mount";

import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import title from "metabase/hoc/Title";

import { checkDatabaseActionsEnabled } from "metabase/actions/utils";
import { loadMetadataForCard } from "metabase/questions/actions";

import ModelDetailPageView from "metabase/models/components/ModelDetailPage";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";

import type { Card, Collection } from "metabase-types/api";
import type { Card as LegacyCardType } from "metabase-types/types/Card";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";

type OwnProps = {
  location: Location;
  params: {
    slug: string;
    tab?: string;
  };
};

type ModelEntityLoaderProps = {
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
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = OwnProps & ModelEntityLoaderProps & StateProps & DispatchProps;

function mapStateToProps(
  state: State,
  props: OwnProps & ModelEntityLoaderProps,
) {
  const metadata = getMetadata(state);
  const model = new Question(props.modelCard, metadata);
  return { model };
}

const mapDispatchToProps = {
  loadMetadataForCard,
  fetchTableForeignKeys: Tables.actions.fetchForeignKeys,
  onChangeModel: (card: Card) => Questions.actions.update(card),
  onChangeCollection: Questions.objectActions.setCollection,
  onChangeLocation: replace,
};

const FALLBACK_TAB = "usage";

function ModelDetailPage({
  model,
  location,
  loadMetadataForCard,
  fetchTableForeignKeys,
  onChangeModel,
  onChangeCollection,
  onChangeLocation,
}: Props) {
  const [hasFetchedTableMetadata, setHasFetchedTableMetadata] = useState(false);

  const database = model.database()?.getPlainObject();
  const hasActionsEnabled =
    database != null && checkDatabaseActionsEnabled(database);

  const mainTable = useMemo(
    () => (model.isStructured() ? model.query().sourceTable() : null),
    [model],
  );

  const tab = useMemo(() => {
    const [tab] = location.pathname.split("/").reverse();
    return tab ?? FALLBACK_TAB;
  }, [location.pathname]);

  useOnMount(() => {
    loadMetadataForCard(model.card());
  });

  useEffect(() => {
    if (mainTable && !hasFetchedTableMetadata) {
      setHasFetchedTableMetadata(true);
      fetchTableForeignKeys({ id: mainTable.id });
    }
  }, [mainTable, hasFetchedTableMetadata, fetchTableForeignKeys]);

  useEffect(() => {
    if (tab === "actions" && !hasActionsEnabled) {
      const nextUrl = Urls.modelDetail(model.card(), FALLBACK_TAB);
      onChangeLocation(nextUrl);
    }
  }, [model, tab, hasActionsEnabled, onChangeLocation]);

  const handleNameChange = useCallback(
    name => {
      if (name && name !== model.displayName()) {
        const nextCard = model.setDisplayName(name).card();
        onChangeModel(nextCard as Card);
      }
    },
    [model, onChangeModel],
  );

  const handleDescriptionChange = useCallback(
    description => {
      if (model.description() !== description) {
        const nextCard = model.setDescription(description).card();
        onChangeModel(nextCard as Card);
      }
    },
    [model, onChangeModel],
  );

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
      tab={tab}
      hasActionsTab={hasActionsEnabled}
      onChangeName={handleNameChange}
      onChangeDescription={handleDescriptionChange}
      onChangeCollection={handleCollectionChange}
    />
  );
}

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

function getModelDatabaseId(
  state: State,
  props: OwnProps & ModelEntityLoaderProps,
) {
  return props.modelCard.dataset_query.database;
}

function getPageTitle({ modelCard }: Props) {
  return modelCard?.name;
}

export default _.compose(
  Questions.load({ id: getModelId, entityAlias: "modelCard" }),
  Databases.load({ id: getModelDatabaseId }),
  connect<StateProps, DispatchProps, OwnProps & ModelEntityLoaderProps, State>(
    mapStateToProps,
    mapDispatchToProps,
  ),
  title(getPageTitle),
)(ModelDetailPage);
