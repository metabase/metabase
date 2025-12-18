import type { LocationDescriptor } from "history";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { replace } from "react-router-redux";
import { useMount } from "react-use";
import _ from "underscore";

import { NotFound } from "metabase/common/components/ErrorPages";
import { Actions } from "metabase/entities/actions";
import { Databases } from "metabase/entities/databases";
import { Questions } from "metabase/entities/questions";
import { Tables } from "metabase/entities/tables";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import ModelActionsView from "metabase/models/components/ModelActions";
import { loadMetadataForCard } from "metabase/questions/actions";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type { Card, WritebackAction } from "metabase-types/api";
import type { State } from "metabase-types/store";

type OwnProps = {
  params: {
    slug: string;
  };
  children: React.ReactNode;
};

type EntityLoadersProps = {
  actions: WritebackAction[];
  model: Question;
};

type DispatchProps = {
  loadMetadataForCard: (card: Card) => void;
  fetchTableForeignKeys: (params: { id: Table["id"] }) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
};

type Props = OwnProps & EntityLoadersProps & DispatchProps;

const mapDispatchToProps = {
  loadMetadataForCard,
  fetchTableForeignKeys: Tables.actions.fetchForeignKeys,
  onChangeLocation: replace,
};

function ModelActions({
  model,
  actions,
  children,
  loadMetadataForCard,
  fetchTableForeignKeys,
  onChangeLocation,
}: Props) {
  const [hasFetchedTableMetadata, setHasFetchedTableMetadata] = useState(false);

  usePageTitle(model?.displayName() || "");

  const database = model.database();
  const hasActions = actions.length > 0;
  const hasActionsEnabled = database != null && database.hasActionsEnabled();
  const shouldShowActionsUI = hasActions || hasActionsEnabled;

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

  if (model.isArchived()) {
    return <NotFound />;
  }

  return (
    <>
      <ModelActionsView
        model={model}
        shouldShowActionsUI={shouldShowActionsUI}
      />
      {/* Required for rendering child `ModalRoute` elements */}
      {children}
    </>
  );
}

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.slug);
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
)(ModelActions);
