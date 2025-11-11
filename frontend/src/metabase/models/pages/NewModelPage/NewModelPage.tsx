import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/data-studio/components/PaneHeader";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import { ModelQueryEditor } from "../../components/ModelQueryEditor";
import { NAME_MAX_LENGTH } from "../../constants";
import { getResultMetadata, getValidationResult } from "../../utils";

import { CreateModelModal } from "./CreateModelModal";
import { getInitialNativeQuery, getInitialQuery, getQuery } from "./utils";

type NewModelPageProps = {
  initialName?: string;
  initialQuery: Lib.Query;
  route: Route;
};

function NewModelPage({
  initialName = t`New model`,
  initialQuery,
  route,
}: NewModelPageProps) {
  const [name, setName] = useState(initialName);
  const [datasetQuery, setDatasetQuery] = useState(() =>
    Lib.toJsQuery(initialQuery),
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const metadata = useSelector(getMetadata);
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
              maxLength={NAME_MAX_LENGTH}
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
          defaultValues={{ name, result_metadata: resultMetadata }}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}

type NewQueryModelPageProps = {
  route: Route;
};

export function NewQueryModelPage({ route }: NewQueryModelPageProps) {
  const metadata = useSelector(getMetadata);
  const initialQuery = useMemo(() => getInitialQuery(metadata), [metadata]);
  return <NewModelPage initialQuery={initialQuery} route={route} />;
}

type NewNativeModelPageProps = {
  route: Route;
};

export function NewNativeModelPage({ route }: NewNativeModelPageProps) {
  const metadata = useSelector(getMetadata);
  const initialQuery = useMemo(
    () => getInitialNativeQuery(metadata),
    [metadata],
  );
  return <NewModelPage initialQuery={initialQuery} route={route} />;
}
