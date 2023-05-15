import React, { useEffect, useCallback, useMemo, useState } from "react";
import _ from "underscore";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import { useMount } from "react-use";
import type { Location, LocationDescriptor } from "history";

import { NotFound } from "metabase/containers/ErrorPages";

import * as Urls from "metabase/lib/urls";

import Actions from "metabase/entities/actions";
import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import { getMetadata } from "metabase/selectors/metadata";
import title from "metabase/hoc/Title";

import { loadMetadataForCard } from "metabase/questions/actions";

import ModelDetailPageView from "metabase/models/components/ModelDetailPage";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";

import type { Card, Collection, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

import Question from "metabase-lib/Question";
import Table from "metabase-lib/metadata/Table";

type OwnProps = {
  location: Location;
  params: {
    slug: string;
    tab?: string;
  };
  children: React.ReactNode;
};

type EntityLoadersProps = {
  actions: WritebackAction[];
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
  loadMetadataForCard: (card: Card) => void;
  fetchTableForeignKeys: (params: { id: Table["id"] }) => void;
  onChangeModel: (card: Card) => void;
  onChangeCollection: (
    card: Card,
    collection: Collection,
    opts: ToastOpts,
  ) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = OwnProps & EntityLoadersProps & StateProps & DispatchProps;

function mapStateToProps(state: State, props: OwnProps & EntityLoadersProps) {
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
  actions,
  location,
  children,
  loadMetadataForCard,
  fetchTableForeignKeys,
  onChangeModel,
  onChangeCollection,
  onChangeLocation,
}: Props) {
  const [hasFetchedTableMetadata, setHasFetchedTableMetadata] = useState(false);

  const database = model.database();
  const hasDataPermissions = model.query().isEditable();
  const hasActions = actions.length > 0;
  const hasActionsEnabled = database != null && database.hasActionsEnabled();
  const hasActionsTab = hasActions || hasActionsEnabled;
  const canRunActions = hasActionsEnabled && hasDataPermissions;

  const mainTable = useMemo(
    () => (model.isStructured() ? model.query().sourceTable() : null),
    [model],
  );

  const tab = useMemo(() => {
    const pathname = location.pathname;

    if (pathname.endsWith("/actions/new")) {
      return "actions";
    }

    const [tab] = pathname.split("/").reverse();
    return tab ?? FALLBACK_TAB;
  }, [location.pathname]);

  useMount(() => {
    const card = model.card();
    const isModel = model.isDataset();
    if (isModel) {
      loadMetadataForCard(card);
    } else {
      onChangeLocation(Urls.question(card));
    }
  });

  useEffect(() => {
    if (mainTable && !hasFetchedTableMetadata) {
      setHasFetchedTableMetadata(true);
      fetchTableForeignKeys({ id: mainTable.id });
    }
  }, [mainTable, hasFetchedTableMetadata, fetchTableForeignKeys]);

  useEffect(() => {
    if (tab === "actions" && !hasActionsTab) {
      const nextUrl = Urls.modelDetail(model.card(), FALLBACK_TAB);
      onChangeLocation(nextUrl);
    }
  }, [model, tab, hasActionsTab, onChangeLocation]);

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

  if (model.isArchived()) {
    return <NotFound />;
  }

  return (
    <>
      <ModelDetailPageView
        model={model}
        mainTable={mainTable}
        tab={tab}
        hasDataPermissions={hasDataPermissions}
        canRunActions={canRunActions}
        hasActionsTab={hasActionsTab}
        onChangeName={handleNameChange}
        onChangeDescription={handleDescriptionChange}
        onChangeCollection={handleCollectionChange}
      />
      {/* Required for rendering child `ModalRoute` elements */}
      {children}
    </>
  );
}

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

function getPageTitle({ modelCard }: Props) {
  return modelCard?.name;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({ id: getModelId, entityAlias: "modelCard" }),
  Databases.loadList(),
  Actions.loadList({
    query: (state: State, props: OwnProps) => ({
      "model-id": getModelId(state, props),
    }),
  }),
  connect<StateProps, DispatchProps, OwnProps & EntityLoadersProps, State>(
    mapStateToProps,
    mapDispatchToProps,
  ),
  title(getPageTitle),
)(ModelDetailPage);
