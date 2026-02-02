import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { Link, type Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Center } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { useTransformPermissions } from "metabase-enterprise/transforms/hooks/use-transform-permissions";
import * as Lib from "metabase-lib";
import type {
  Database,
  DraftTransformSource,
  Transform,
} from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { NAME_MAX_LENGTH } from "../../constants";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { getValidationResult, isCompleteSource } from "../../utils";

import { CreateTransformModal } from "./CreateTransformModal";
import {
  getDefaultValues,
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
    transformsDatabases,
    isLoadingDatabases: isLoading,
    databasesError: error,
  } = useTransformPermissions();

  if (isLoading || error != null || transformsDatabases == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <NewTransformPageBody
      initialSource={initialSource}
      databases={transformsDatabases}
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
  const [name, setName] = useState(suggestedTransform?.name ?? "");
  const [uiState, setUiState] = useState(getInitialUiState);
  const metadata = useSelector(getMetadata);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const dispatch = useDispatch();
  useRegisterMetabotTransformContext(undefined, source);

  const validationResult = useMemo(() => {
    return source.type === "query"
      ? getValidationResult(Lib.fromJsQueryAndMetadata(metadata, source.query))
      : PLUGIN_TRANSFORMS_PYTHON.getPythonSourceValidationResult(source);
  }, [source, metadata]);

  const handleCreate = (transform: Transform) => {
    dispatch(push(Urls.transform(transform.id)));
  };

  const handleCancel = () => {
    dispatch(push(Urls.transformList()));
  };

  return (
    <>
      <PageContainer pos="relative" data-testid="transform-query-editor">
        <PaneHeader
          title={
            <PaneHeaderInput
              initialValue={name}
              placeholder={t`New transform`}
              maxLength={NAME_MAX_LENGTH}
              isOptional
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
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link key="transform-list" to={Urls.transformList()}>
                {t`Transforms`}
              </Link>
              {t`New transform`}
            </DataStudioBreadcrumbs>
          }
          showMetabotButton
        />
        <Box
          w="100%"
          bg="background-primary"
          bdrs="md"
          bd="1px solid var(--mb-color-border)"
          flex={1}
          style={{
            overflow: "hidden",
          }}
        >
          {source.type === "python" ? (
            <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
              source={source}
              proposedSource={
                proposedSource?.type === "python" ? proposedSource : undefined
              }
              isEditMode
              onChangeSource={setSourceAndRejectProposed}
              onAcceptProposed={acceptProposed}
              onRejectProposed={rejectProposed}
            />
          ) : (
            <TransformEditor
              isEditMode
              source={source}
              proposedSource={
                proposedSource?.type === "query" ? proposedSource : undefined
              }
              uiState={uiState}
              databases={databases}
              onChangeSource={setSourceAndRejectProposed}
              onChangeUiState={setUiState}
              onAcceptProposed={acceptProposed}
              onRejectProposed={rejectProposed}
            />
          )}
        </Box>
      </PageContainer>
      {isModalOpened && isCompleteSource(source) && (
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
