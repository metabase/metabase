import { useDisclosure } from "@mantine/hooks";
import type { Location } from "history";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useGetDefaultCollectionId } from "metabase/collections/hooks";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack } from "metabase/ui";
import { getResultMetadata } from "metabase-enterprise/data-studio/common/utils";
import * as Lib from "metabase-lib";
import type { Card, CollectionId } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "../../../common/components/PaneHeader";
import { ModelQueryEditor } from "../../components/ModelQueryEditor";
import { NAME_MAX_LENGTH } from "../../constants";
import { getValidationResult } from "../../utils";

import { CreateModelModal } from "./CreateModelModal";
import { getInitialNativeQuery, getInitialQuery, getQuery } from "./utils";

type NewModelPageQuery = {
  collectionId?: string;
};

type NewModelPageProps = {
  initialQuery: Lib.Query;
  initialCollectionId?: CollectionId | null;
  route: Route;
};

function NewModelPage({
  initialQuery,
  initialCollectionId,
  route,
}: NewModelPageProps) {
  const [name, setName] = useState("");
  const [datasetQuery, setDatasetQuery] = useState(() =>
    Lib.toJsQuery(initialQuery),
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const metadata = useSelector(getMetadata);
  const defaultCollectionId = useGetDefaultCollectionId();
  const dispatch = useDispatch();

  const query = useMemo(
    () => getQuery(datasetQuery, metadata),
    [datasetQuery, metadata],
  );

  const resultMetadata = useMemo(() => {
    return getResultMetadata(
      datasetQuery,
      uiState.lastRunQuery,
      uiState.lastRunResult,
    );
  }, [datasetQuery, uiState.lastRunResult, uiState.lastRunQuery]);

  const validationResult = useMemo(
    () => getValidationResult(query, resultMetadata),
    [query, resultMetadata],
  );

  const defaultValues = useMemo(
    () => ({
      name,
      result_metadata: resultMetadata,
      collection_id: initialCollectionId ?? defaultCollectionId,
    }),
    [name, resultMetadata, initialCollectionId, defaultCollectionId],
  );

  const handleCreate = (card: Card) => {
    dispatch(push(Urls.dataStudioModel(card.id)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(push(Urls.dataStudioModeling()));
  };

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="bg-white"
        data-testid="model-query-editor"
        gap={0}
      >
        <PaneHeader
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New model`}
              maxLength={NAME_MAX_LENGTH}
              isOptional
              onChange={setName}
            />
          }
          icon="model"
          actions={
            <PaneHeaderActions
              errorMessage={validationResult.errorMessage}
              isValid={validationResult.isValid}
              isDirty
              onSave={openModal}
              onCancel={handleCancel}
            />
          }
        />
        <ModelQueryEditor
          query={query}
          uiState={uiState}
          onChangeQuery={handleChangeQuery}
          onChangeUiState={setUiState}
        />
      </Stack>
      {isModalOpened && (
        <CreateModelModal
          query={query}
          defaultValues={defaultValues}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}

type NewQueryModelPageProps = {
  location: Location<NewModelPageQuery>;
  route: Route;
};

export function NewQueryModelPage({ route, location }: NewQueryModelPageProps) {
  const metadata = useSelector(getMetadata);
  const initialQuery = useMemo(() => getInitialQuery(metadata), [metadata]);
  const collectionId = Urls.extractCollectionId(location.query.collectionId);

  return (
    <NewModelPage
      initialQuery={initialQuery}
      initialCollectionId={collectionId}
      route={route}
    />
  );
}

type NewNativeModelPageProps = {
  location: Location<NewModelPageQuery>;
  route: Route;
};

export function NewNativeModelPage({
  location,
  route,
}: NewNativeModelPageProps) {
  const metadata = useSelector(getMetadata);
  const initialQuery = useMemo(
    () => getInitialNativeQuery(metadata),
    [metadata],
  );
  const initialCollectionId = Urls.extractCollectionId(
    location.query.collectionId,
  );

  return (
    <NewModelPage
      initialQuery={initialQuery}
      initialCollectionId={initialCollectionId}
      route={route}
    />
  );
}
