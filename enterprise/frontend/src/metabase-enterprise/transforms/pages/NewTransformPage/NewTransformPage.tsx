import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQuery,
  useListDatabasesQuery,
} from "metabase/api";
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
  getDefaultValues,
  getInitialCardSource,
  getInitialNativeSource,
  getInitialPythonSource,
  getInitialQuerySource,
} from "./utils";

type NewTransformPageProps = {
  initialName?: string;
  initialSource: DraftTransformSource;
  route: Route;
};

function NewTransformPage({
  initialName = t`New transform`,
  initialSource,
  route,
}: NewTransformPageProps) {
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
      initialName={initialName}
      initialSource={initialSource}
      databases={databases.data}
      route={route}
    />
  );
}

type NewTransformPageBodyProps = {
  initialName: string;
  initialSource: DraftTransformSource;
  databases: Database[];
  route: Route;
};

function NewTransformPageBody({
  initialName,
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
  const [name, setName] = useState(suggestedTransform?.name ?? initialName);
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

  return (
    <>
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
          name={name}
          source={source}
          proposedSource={
            proposedSource?.type === "query" ? proposedSource : undefined
          }
          uiState={uiState}
          databases={databases}
          isSaving={false}
          isDirty={isDirty}
          onChangeName={setName}
          onChangeSource={setSourceAndRejectProposed}
          onChangeUiState={setUiState}
          onSave={openModal}
          onCancel={handleCancel}
          onAcceptProposed={acceptProposed}
          onRejectProposed={rejectProposed}
        />
      )}
      {isModalOpened && isNotDraftSource(source) && (
        <CreateTransformModal
          source={source}
          defaultValues={getDefaultValues(name, suggestedTransform)}
          onCreate={handleCreate}
          onClose={closeModal}
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
