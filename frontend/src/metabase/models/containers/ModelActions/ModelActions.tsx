import { useEffect, useMemo, useState } from "react";
import { useMount } from "react-use";

import {
  skipToken,
  useGetCardQuery,
  useGetTableQuery,
  useListActionsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useQuestionFromCard } from "metabase/metadata-store";
import ModelActionsView from "metabase/models/components/ModelActions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { connect } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { fetchTableForeignKeys } from "metabase/redux/tables";
import { Outlet, useNavigate, useParams } from "metabase/router";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type { Card, TableId } from "metabase-types/api";

type ModelActionsParams = {
  slug: string;
};

type EntityLoadersProps = {
  model: Question;
};

type DispatchProps = {
  loadMetadataForCard: (card: Card) => void;
  fetchTableForeignKeys: (params: { id: TableId }) => void;
};

type Props = EntityLoadersProps & DispatchProps;

const mapDispatchToProps = {
  loadMetadataForCard,
  fetchTableForeignKeys,
};

function ModelActions({
  model,
  loadMetadataForCard,
  fetchTableForeignKeys,
}: Props) {
  const navigate = useNavigate();
  useListDatabasesQuery();
  const { data: actions = [] } = useListActionsQuery({
    "model-id": model.id(),
  });
  const [hasFetchedTableMetadata, setHasFetchedTableMetadata] = useState(false);

  usePageTitle(model?.displayName() || "");

  const card = model.card();
  const isModel = model.type() === "model";
  const databaseId = Lib.databaseID(model.query());
  const hasActions = actions.length > 0;
  const hasActionsEnabled =
    Lib.databaseDisplayInfo(model.query())?.isActionsEnabled ?? false;
  const shouldShowActionsUI = hasActions || hasActionsEnabled;

  const mainTableId = useMemo(() => {
    const query = model.query();
    const { isNative } = Lib.queryDisplayInfo(query);

    if (isNative) {
      return null;
    }

    return Lib.primarySourceTableId(query);
  }, [model]);

  useMount(() => {
    if (!isModel) {
      navigate(Urls.card(card), { replace: true });
    }
  });

  useEffect(() => {
    if (isModel && databaseId != null) {
      loadMetadataForCard(card);
    }
  }, [card, databaseId, isModel, loadMetadataForCard]);

  // The table request is also the permission check: a user who cannot read the
  // table gets no table, and its foreign keys are not asked for.
  const { data: mainTable } = useGetTableQuery(
    mainTableId != null ? { id: mainTableId } : skipToken,
  );

  useEffect(() => {
    if (mainTable != null && !hasFetchedTableMetadata) {
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
      {/* Required for rendering child modal routes */}
      <Outlet />
    </>
  );
}

function ModelActionsLoader(dispatchProps: DispatchProps) {
  const params = useParams<ModelActionsParams>();
  const modelId = Urls.extractEntityId(params.slug);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(modelId != null ? { id: modelId } : skipToken);
  const model = useQuestionFromCard(card);

  if (!model) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <ModelActions model={model} {...dispatchProps} />;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<unknown, DispatchProps, unknown, State>(
  null,
  mapDispatchToProps,
)(ModelActionsLoader);
