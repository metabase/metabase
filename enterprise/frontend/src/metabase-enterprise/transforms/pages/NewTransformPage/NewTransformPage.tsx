import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";

import {
  skipToken,
  useGetCardQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { Center } from "metabase/ui";
import type {
  Database,
  DraftTransformSource,
  Transform,
} from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { isNotDraftSource } from "../../utils";

import { CreateTransformModal } from "./CreateTransformModal";
import {
  getInitialCardSource,
  getInitialNativeSource,
  getInitialPythonSource,
  getInitialQuerySource,
} from "./utils";

type NewTransformPageProps = {
  initialSource: DraftTransformSource;
  route: Route;
};

function NewTransformPage({ initialSource, route }: NewTransformPageProps) {
  const {
    data: databases,
    isLoading,
    error,
  } = useListDatabasesQuery({ include_analytics: true });

  if (isLoading || error != null || databases == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <NewTransformPageBody
      initialSource={initialSource}
      databases={databases.data}
      route={route}
    />
  );
}

type NewTransformPageBodyProps = {
  initialSource: DraftTransformSource;
  databases: Database[];
  route: Route;
};

function NewTransformPageBody({
  initialSource,
  databases,
  route,
}: NewTransformPageBodyProps) {
  const {
    source,
    proposedSource,
    suggestedTransform,
    isDirty,
    setSourceAndRejectProposed,
    acceptProposed,
    rejectProposed,
  } = useSourceState({ initialSource });
  const [uiState, setUiState] = useState(getInitialUiState);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();
  useRegisterMetabotTransformContext(undefined, source);

  const handleCreate = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  const handleCancel = () => {
    dispatch(push(Urls.transformList()));
  };

  const handleModalClose = () => {
    // If modal is closed without saving, reset the incremental checkbox
    closeModal();
  };

  return (
    <>
      <AdminSettingsLayout fullWidth>
        {source.type === "python" ? (
          <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
            source={source}
            proposedSource={
              proposedSource?.type === "python" ? proposedSource : undefined
            }
            isNew={true}
            isDirty={isDirty}
            isSaving={false}
            onChangeSource={setSourceAndRejectProposed}
            onSave={openModal}
            onCancel={handleCancel}
            onAcceptProposed={acceptProposed}
            onRejectProposed={rejectProposed}
          />
        ) : (
          <TransformEditor
            source={source}
            proposedSource={
              proposedSource?.type === "query" ? proposedSource : undefined
            }
            uiState={uiState}
            databases={databases}
            isNew={true}
            isSaving={false}
            isDirty={isDirty}
            onChangeSource={setSourceAndRejectProposed}
            onChangeUiState={setUiState}
            onSave={openModal}
            onCancel={handleCancel}
            onAcceptProposed={acceptProposed}
            onRejectProposed={rejectProposed}
          />
        )}
      </AdminSettingsLayout>
      {isModalOpened && isNotDraftSource(source) && (
        <CreateTransformModal
          source={source}
          suggestedTransform={suggestedTransform}
          onCreate={handleCreate}
          onClose={handleModalClose}
        />
      )}
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isModalOpened}
        onConfirm={rejectProposed}
      />
    </>
  );
}

type NewQueryTransformPageProps = {
  route: Route;
};

export function NewQueryTransformPage({ route }: NewQueryTransformPageProps) {
  const initialSource = useMemo(() => getInitialQuerySource(), []);
  return <NewTransformPage initialSource={initialSource} route={route} />;
}

type NewNativeTransformPageProps = {
  route: Route;
};

export function NewNativeTransformPage({ route }: NewNativeTransformPageProps) {
  const initialSource = useMemo(() => getInitialNativeSource(), []);
  return <NewTransformPage initialSource={initialSource} route={route} />;
}

type NewPythonTransformPageProps = {
  route: Route;
};

export function NewPythonTransformPage({ route }: NewPythonTransformPageProps) {
  const initialSource = useMemo(() => getInitialPythonSource(), []);
  return <NewTransformPage initialSource={initialSource} route={route} />;
}

type NewCardTransformPageParams = {
  cardId: string;
};

type NewCardTransformPageProps = {
  params: NewCardTransformPageParams;
  route: Route;
};

export function NewCardTransformPage({
  params,
  route,
}: NewCardTransformPageProps) {
  const cardId = Urls.extractEntityId(params.cardId);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(cardId != null ? { id: cardId } : skipToken);

  const initialSource = useMemo(
    () => (card != null ? getInitialCardSource(card) : undefined),
    [card],
  );

  if (isLoading || error || initialSource == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <NewTransformPage initialSource={initialSource} route={route} />;
}
