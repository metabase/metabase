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
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();

  const query = useMemo(
    () => getQuery(datasetQuery, metadata),
    [datasetQuery, metadata],
  );

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
          defaultValues={{ name }}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={!isModalOpened} />
    </>
  );
}
