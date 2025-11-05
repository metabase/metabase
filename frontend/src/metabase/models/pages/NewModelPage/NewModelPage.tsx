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

import { ModelEditor } from "../../components/ModelEditor";

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

  const handleCreate = (model: Card) => {
    dispatch(push(Urls.dataStudioModel(model.id)));
  };

  const handleChangeQuery = (query: Lib.Query) => {
    setDatasetQuery(Lib.toJsQuery(query));
  };

  const handleCancel = () => {
    dispatch(push(Urls.dataStudioModeling()));
  };

  return (
    <>
      <ModelEditor
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
        <CreateModelModal
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
