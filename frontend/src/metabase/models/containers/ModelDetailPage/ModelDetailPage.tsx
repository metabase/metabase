import type { Location, LocationDescriptor } from "history";
import type * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { connect } from "react-redux";
import { replace } from "react-router-redux";
import { useMount } from "react-use";
import _ from "underscore";

import { NotFound } from "metabase/components/ErrorPages";
import Actions from "metabase/entities/actions";
import Databases from "metabase/entities/databases";
import Questions from "metabase/entities/questions";
import Tables from "metabase/entities/tables";
import title from "metabase/hoc/Title";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import ModelDetailPageView from "metabase/models/components/ModelDetailPage";
import { loadMetadataForCard } from "metabase/questions/actions";
import QuestionMoveToast from "metabase/questions/components/QuestionMoveToast";
import { getSetting } from "metabase/selectors/settings";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type { Card, CollectionId, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

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
    collection: { id: CollectionId },
    opts: ToastOpts,
  ) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = OwnProps & EntityLoadersProps & DispatchProps;

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
  const hasNestedQueriesEnabled = useSelector(state =>
    getSetting(state, "enable-nested-queries"),
  );

  const database = model.database();
  const { isEditable } = Lib.queryDisplayInfo(model.query());
  const hasDataPermissions = isEditable;
  const hasActions = actions.length > 0;
  const hasActionsEnabled = database != null && database.hasActionsEnabled();
  const hasActionsTab = hasActions || hasActionsEnabled;
  const supportsNestedQueries =
    database != null && database.hasFeature("nested-queries");

  const mainTable = useMemo(() => {
    const query = model.query();
    const { isNative } = Lib.queryDisplayInfo(query);

    if (isNative) {
      return null;
    }

    const sourceTableId = Lib.sourceTableOrCardId(query);
    const table = model.metadata().table(sourceTableId);
    return table;
  }, [model]);

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
    const isModel = model.type() === "model";
    if (isModel) {
      if (model.database()) {
        loadMetadataForCard(card);
      }
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
    (name: string | undefined) => {
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
    (collection: { id: CollectionId }) => {
      onChangeCollection(model.card() as Card, collection, {
        notify: {
          message: (
            <QuestionMoveToast collectionId={collection.id} question={model} />
          ),
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
        hasActionsTab={hasActionsTab}
        hasNestedQueriesEnabled={hasNestedQueriesEnabled}
        supportsNestedQueries={supportsNestedQueries}
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

function getPageTitle({ model }: Props) {
  return model?.displayName();
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({ id: getModelId, entityAlias: "model" }),
  Databases.loadList(),
  Actions.loadList({
    query: (state: State, props: OwnProps) => ({
      "model-id": getModelId(state, props),
    }),
  }),
  connect<null, DispatchProps, OwnProps & EntityLoadersProps, State>(
    null,
    mapDispatchToProps,
  ),
  title(getPageTitle),
)(ModelDetailPage);
