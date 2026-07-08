import type { LocationDescriptor } from "history";
import { useEffect, useMemo, useState } from "react";
import { replace } from "react-router-redux";
import { useMount } from "react-use";

import {
  skipToken,
  useGetCardQuery,
  useListActionsQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { usePageTitle } from "metabase/hooks/use-page-title";
import ModelActionsView from "metabase/models/components/ModelActions";
import { loadMetadataForCard } from "metabase/questions/actions";
import { connect, useSelector } from "metabase/redux";
import type { State } from "metabase/redux/store";
import { fetchTableForeignKeys } from "metabase/redux/tables";
import { getMetadata } from "metabase/selectors/metadata";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type Question from "metabase-lib/v1/Question";
import type Table from "metabase-lib/v1/metadata/Table";
import type { Card } from "metabase-types/api";

type OwnProps = {
  params: {
    slug: string;
  };
  children: React.ReactNode;
};

type EntityLoadersProps = {
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
  fetchTableForeignKeys,
  onChangeLocation: replace,
};

function ModelActions({
  model,
  children,
  loadMetadataForCard,
  fetchTableForeignKeys,
  onChangeLocation,
}: Props) {
  useListDatabasesQuery();
  const { data: actions = [] } = useListActionsQuery({
    "model-id": model.id(),
  });
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
      onChangeLocation(Urls.card(card));
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

function ModelActionsLoader({
  params,
  children,
  ...dispatchProps
}: OwnProps & DispatchProps) {
  const modelId = Urls.extractEntityId(params.slug);
  const { isLoading, error } = useGetCardQuery(
    modelId != null ? { id: modelId } : skipToken,
  );
  const model = useSelector((state) =>
    modelId != null ? getMetadata(state).question(modelId) : undefined,
  );

  if (!model) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ModelActions model={model} params={params} {...dispatchProps}>
      {children}
    </ModelActions>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect<null, DispatchProps, OwnProps, State>(
  null,
  mapDispatchToProps,
)(ModelActionsLoader);
