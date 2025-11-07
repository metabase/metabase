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
import type { Card, Field } from "metabase-types/api";

import { MetricQueryEditor } from "../../components/MetricQueryEditor";
import { NAME_MAX_LENGTH } from "../../constants";
import { getValidationResult } from "../../utils";

import { CreateMetricModal } from "./CreateMetricModal";
import { getInitialQuery, getQuery } from "./utils";

type NewMetricPageProps = {
  route: Route;
};

export function NewMetricPage({ route }: NewMetricPageProps) {
  const metadata = useSelector(getMetadata);
  const [name, setName] = useState(t`New metric`);
  const [datasetQuery, setDatasetQuery] = useState(() =>
    Lib.toJsQuery(getInitialQuery(metadata)),
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [resultMetadata, setResultMetadata] = useState<Field[] | null>(null);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const query = useMemo(
    () => getQuery(datasetQuery, metadata),
    [datasetQuery, metadata],
  );

  const validationResult = useMemo(() => getValidationResult(query), [query]);

  const handleCreate = (card: Card) => {
    dispatch(push(Urls.dataStudioMetric(card.id)));
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
        data-testid="metric-query-editor"
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
          onChangeResultMetadata={setResultMetadata}
        />
      </Stack>
      {isModalOpened && (
        <CreateMetricModal
          query={query}
          defaultValues={{ name, resultMetadata }}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}
