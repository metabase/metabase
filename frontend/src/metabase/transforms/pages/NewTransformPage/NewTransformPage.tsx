import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken, useGetCardQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import {
  PaneHeader,
  PaneHeaderActions,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { PLUGIN_REMOTE_SYNC, PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { useDispatch, useSelector } from "metabase/redux";
import { Link, type Location, push, useParams } from "metabase/router";
import { getMetadata } from "metabase/selectors/metadata";
import { useRegisterMetabotTransformContext } from "metabase/transforms/hooks/use-register-transform-metabot-context";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Box, Center } from "metabase/ui";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import type {
  Database,
  DraftTransformSource,
  Transform,
} from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { NAME_MAX_LENGTH } from "../../constants";
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
};

function NewTransformPage({ initialSource }: NewTransformPageProps) {
  const {
    transformsDatabases,
    isLoadingDatabases: isLoading,
    databasesError: error,
  } = useTransformPermissions();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  if (isLoading || error != null || transformsDatabases == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  if (isRemoteSyncReadOnly) {
    return (
      <PageContainer pos="relative" data-testid="transform-query-editor">
        <PaneHeader
          breadcrumbs={
            <DataStudioBreadcrumbs>
              <Link key="transform-list" to={Urls.transformList()}>
                {t`Data transformation`}
              </Link>
            </DataStudioBreadcrumbs>
          }
        />
        <NotFound />
      </PageContainer>
    );
  }

  return (
    <NewTransformPageBody
      initialSource={initialSource}
      databases={transformsDatabases}
    />
  );
}

type NewTransformPageBodyProps = {
  initialSource: DraftTransformSource;
  databases: Database[];
};

function NewTransformPageBody({
  initialSource,
  databases,
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
  const [isLeaveWarningOpen, setIsLeaveWarningOpen] = useState(false);
  const dispatch = useDispatch();
  const [dryRunError, setDryRunError] = useState<string | undefined>(undefined);
  useRegisterMetabotTransformContext(undefined, source, dryRunError);

  const validationResult = useMemo(() => {
    return source.type === "query"
      ? getValidationResult(Lib.fromJsQueryAndMetadata(metadata, source.query))
      : PLUGIN_TRANSFORMS_PYTHON.getPythonSourceValidationResult(source);
  }, [source, metadata]);

  const isSavedRef = useRef(false);

  const handleCreate = (transform: Transform) => {
    isSavedRef.current = true;
    dispatch(push(Urls.transform(transform.id)));
  };

  const handleCancel = () => {
    dispatch(push(Urls.transformList()));
  };

  const isLocationAllowed = useCallback(
    (location?: Location) => !location || isSavedRef.current,
    [],
  );

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
                {t`Data transformation`}
              </Link>
              {t`New transform`}
            </DataStudioBreadcrumbs>
          }
          showMetabotButton
        />
        <Box
          w="100%"
          bg="background_page-primary"
          bdrs="md"
          bd="1px solid var(--mb-color-border-neutral)"
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
              onDryRunErrorChange={setDryRunError}
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
          closeOnEscape={!isLeaveWarningOpen}
          onCreate={handleCreate}
          onClose={closeModal}
        />
      )}
      <LeaveRouteConfirmModal
        isEnabled={isDirty}
        isLocationAllowed={isLocationAllowed}
        onConfirm={rejectProposed}
        onOpenChange={setIsLeaveWarningOpen}
      />
    </>
  );
}

export function NewQueryTransformPage() {
  const initialSource = useMemo(() => getInitialQuerySource(), []);
  return <NewTransformPage initialSource={initialSource} />;
}

export function NewNativeTransformPage() {
  const initialSource = useMemo(() => getInitialNativeSource(), []);
  return <NewTransformPage initialSource={initialSource} />;
}

export function NewPythonTransformPage() {
  const initialSource = useMemo(() => getInitialPythonSource(), []);
  return <NewTransformPage initialSource={initialSource} />;
}

type NewCardTransformPageParams = {
  cardId: string;
};

export function NewCardTransformPage() {
  const params = useParams<NewCardTransformPageParams>();
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

  return <NewTransformPage initialSource={initialSource} />;
}
