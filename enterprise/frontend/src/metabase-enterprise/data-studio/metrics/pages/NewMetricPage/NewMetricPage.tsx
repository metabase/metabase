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
import type { Card } from "metabase-types/api";

import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "../../../common/components/PaneHeader";
import { MetricQueryEditor } from "../../components/MetricQueryEditor";
import { NAME_MAX_LENGTH } from "../../constants";
import { getValidationResult } from "../../utils";

import { CreateMetricModal } from "./CreateMetricModal";
import { getInitialQuery, getQuery } from "./utils";

type NewMetricPageQuery = {
  collectionId?: string;
};

type NewMetricPageProps = {
  location: Location<NewMetricPageQuery>;
  route: Route;
};

export function NewMetricPage({ location, route }: NewMetricPageProps) {
  const metadata = useSelector(getMetadata);
  const [name, setName] = useState("");
  const [datasetQuery, setDatasetQuery] = useState(() =>
    Lib.toJsQuery(getInitialQuery(metadata)),
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const initialCollectionId = Urls.extractCollectionId(
    location.query.collectionId,
  );
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

  const validationResult = useMemo(() => getValidationResult(query), [query]);

  const defaultValues = useMemo(
    () => ({
      name,
      result_metadata: resultMetadata,
      collection_id: initialCollectionId ?? defaultCollectionId,
    }),
    [name, resultMetadata, initialCollectionId, defaultCollectionId],
  );

  const handleCreate = (card: Card) => {
    dispatch(push(Urls.dataStudioMetric(card.id)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(push(Urls.dataStudioLibrary()));
  };

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="background-primary"
        data-testid="metric-query-editor"
        gap={0}
      >
        <PaneHeader
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New metric`}
              maxLength={NAME_MAX_LENGTH}
              isOptional
              onChange={setName}
            />
          }
          icon="metric"
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
        <MetricQueryEditor
          query={query}
          uiState={uiState}
          onChangeQuery={handleChangeQuery}
          onChangeUiState={setUiState}
        />
      </Stack>
      {isModalOpened && (
        <CreateMetricModal
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
