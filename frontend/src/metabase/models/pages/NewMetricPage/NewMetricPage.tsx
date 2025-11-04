import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import * as Lib from "metabase-lib";
import type { Card } from "metabase-types/api";

import { MetricEditor } from "../../components/MetricEditor";
import {
  getDefaultValues,
  getInitialNativeQuery,
  getInitialQuery,
  getQuery,
} from "../shared";

import { CreateMetricModal } from "./CreateMetricModal";

type NewMetricPageProps = {
  initialName?: string;
  initialQuery: Lib.Query;
  route: Route;
};

function NewMetricPage({
  initialName = t`New metric`,
  initialQuery,
  route,
}: NewMetricPageProps) {
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

  const handleCreate = (metric: Card) => {
    dispatch(push(Urls.dataStudioMetric(metric.id)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(push(Urls.dataStudioModeling()));
  };

  return (
    <>
      <MetricEditor
        name={name}
        query={query}
        uiState={uiState}
        isDirty
        isSaving={false}
        onChangeName={setName}
        onChangeQuery={handleChangeQuery}
        onChangeUiState={setUiState}
        onSave={openModal}
        onCancel={handleCancel}
      />
      {isModalOpened && (
        <CreateMetricModal
          query={query}
          defaultValues={getDefaultValues(name)}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}

type NewQueryMetricPageProps = {
  route: Route;
};

export function NewQueryMetricPage({ route }: NewQueryMetricPageProps) {
  const metadata = useSelector(getMetadata);
  const initialQuery = useMemo(() => getInitialQuery(metadata), [metadata]);
  return <NewMetricPage initialQuery={initialQuery} route={route} />;
}

type NewNativeMetricPageProps = {
  route: Route;
};

export function NewNativeMetricPage({ route }: NewNativeMetricPageProps) {
  const metadata = useSelector(getMetadata);
  const initialQuery = useMemo(
    () => getInitialNativeQuery(metadata),
    [metadata],
  );
  return <NewMetricPage initialQuery={initialQuery} route={route} />;
}
