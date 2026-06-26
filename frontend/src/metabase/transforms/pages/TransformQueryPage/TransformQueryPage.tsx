import { useDisclosure } from "@mantine/hooks";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { Route, RouteProps } from "react-router";
import { push } from "react-router-redux";
import { useLatest } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { EmptyState } from "metabase/common/components/EmptyState/EmptyState";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_REMOTE_SYNC, PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { useDispatch, useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { useRegisterMetabotTransformContext } from "metabase/transforms/hooks/use-register-transform-metabot-context";
import { useTransformPermissions } from "metabase/transforms/hooks/use-transform-permissions";
import { Box, Center, Group, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type {
  Database,
  DatasetQuery,
  DraftTransformSource,
  Transform,
  UpdateTransformRequest,
} from "metabase-types/api";

import {
  buildIncrementalSource,
  buildIncrementalTarget,
  getInitialValues,
} from "../../components/IncrementalTransform/form";
import { TransformDisconnectedDatabaseBanner } from "../../components/TransformDisconnectedDatabaseBanner";
import {
  TransformEditor,
  type TransformEditorProps,
} from "../../components/TransformEditor";
import { TransformHeader } from "../../components/TransformHeader";
import { useSourceState } from "../../hooks/use-source-state";
import { isCompleteSource } from "../../utils";

import { TransformPaneHeaderActions } from "./TransformPaneHeaderActions";
import { isMissingIncrementalTableTag } from "./utils";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
  route: RouteProps;
};

export function TransformQueryPage({ params, route }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);
  const { readOnly, transformsDatabases, isLoadingDatabases, databasesError } =
    useTransformPermissions({ transform });
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null || transformsDatabases == null) {
    return <LoadingAndErrorWrapper error={t`Transform not found.`} />;
  }

  return (
    <TransformQueryPageBody
      // Add key so the ui state gets reset when switching between edit and view
      key={route.path}
      transform={transform}
      databases={transformsDatabases}
      route={route}
      readOnly={readOnly}
    />
  );
}

type TransformQueryPageBodyProps = {
  transform: Transform;
  databases: Database[];
  route: RouteProps;
  readOnly?: boolean;
};

function TransformQueryPageBody({
  transform,
  databases,
  route,
  readOnly,
}: TransformQueryPageBodyProps) {
  const {
    source,
    proposedSource,
    isDirty,
    setSource,
    setSourceAndRejectProposed,
    acceptProposed,
    rejectProposed,
  } = useSourceState({
    transformId: transform.id,
    initialSource: transform.source,
  });
  const dispatch = useDispatch();
  const metadata = useSelector(getMetadata);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const isEditMode = !readOnly && !!route.path?.includes("/edit");
  const [
    isTurnOffIncrementalShown,
    { open: openTurnOffIncremental, close: closeTurnOffIncremental },
  ] = useDisclosure(false);

  const lastRunError = useMemo(() => {
    if (!transform.last_run) {
      return undefined;
    }
    return transform.last_run.status === "failed"
      ? (transform.last_run.message ?? undefined)
      : undefined;
  }, [transform.last_run]);
  const [dryRunError, setDryRunError] = useState<string | undefined>(undefined);
  useRegisterMetabotTransformContext(
    transform,
    source,
    dryRunError ?? lastRunError,
  );

  const handleResetRef = useLatest(() => {
    setSource(transform.source);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    handleResetRef.current();
  }, [transform.id, handleResetRef]);

  useEffect(() => {
    if (source.type !== "python" && !isEditMode) {
      setSourceAndRejectProposed(transform.source);
    }
  }, [source.type, isEditMode, setSourceAndRejectProposed, transform.source]);

  useEffect(() => {
    if (isEditMode && isRemoteSyncReadOnly) {
      // If remote sync is set up to read-only mode, user can't edit transforms
      dispatch(push(Urls.transform(transform.id)));
    }
  }, [isRemoteSyncReadOnly, isEditMode, dispatch, transform.id]);

  const handleSave = async (request: UpdateTransformRequest) => {
    const { error } = await updateTransform(request);
    if (error) {
      const message = getErrorMessage(error);
      sendErrorToast(
        message
          ? t`Failed to update transform query: ${message}`
          : t`Failed to update transform query`,
      );
    } else {
      sendSuccessToast(t`Transform query updated`);

      if (isEditMode) {
        dispatch(push(Urls.transform(transform.id)));
      }
    }
  };

  const handleSaveAttempt = async () => {
    if (!isCompleteSource(source)) {
      return;
    }
    // Editing the SQL of an existing incremental transform to drop the table variable
    // would leave it in a broken state (and the backend rejects it). Warn first, and on
    // confirmation turn off incremental processing as part of the save.
    if (isMissingIncrementalTableTag(transform, source, metadata)) {
      openTurnOffIncremental();
      return;
    }
    await handleSave({ id: transform.id, source });
  };

  const handleConfirmTurnOffIncremental = async () => {
    if (!isCompleteSource(source)) {
      return;
    }
    closeTurnOffIncremental();
    const values = getInitialValues({ incremental: false });
    await handleSave({
      id: transform.id,
      source: buildIncrementalSource(source, values),
      target: buildIncrementalTarget(transform.target, values),
    });
  };

  const handleCancel = () => {
    if (isEditMode) {
      dispatch(push(Urls.transform(transform.id)));
    }
  };

  return (
    <>
      <PageContainer data-testid="transform-query-editor">
        <TransformHeader
          transform={transform}
          actions={
            <Group gap="sm">
              <TransformPaneHeaderActions
                source={source}
                isSaving={isSaving}
                isDirty={isDirty}
                handleSave={handleSaveAttempt}
                handleCancel={handleCancel}
                transform={transform}
                readOnly={readOnly}
                isEditMode={isEditMode}
              />
            </Group>
          }
          hasMenu={!isEditMode && !isDirty}
          isEditMode={isEditMode}
          readOnly={readOnly}
        />
        <TransformDisconnectedDatabaseBanner transform={transform} />
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
          {transform.can_read === false ? (
            <Center h="100%">
              <EmptyState
                title={t`Sorry, you don't have permission to view this transform.`}
                illustrationElement={<Icon name="key" size={100} />}
              />
            </Center>
          ) : source.type === "python" ? (
            <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
              source={source}
              proposedSource={
                proposedSource?.type === "python" ? proposedSource : undefined
              }
              uiOptions={{ readOnly }}
              isEditMode={isEditMode}
              transform={transform}
              onChangeSource={setSourceAndRejectProposed}
              onAcceptProposed={acceptProposed}
              onRejectProposed={rejectProposed}
              onDryRunErrorChange={setDryRunError}
            />
          ) : (
            <TransformEditor
              source={source}
              proposedSource={
                proposedSource?.type === "query" ? proposedSource : undefined
              }
              uiState={uiState}
              // TODO (Uladzimir 2026-01-28) -- probably not the proper fix
              uiOptions={{ resizable: isEditMode && !readOnly }}
              isEditMode={isEditMode}
              databases={databases}
              onChangeSource={setSourceAndRejectProposed}
              onChangeUiState={setUiState}
              onAcceptProposed={acceptProposed}
              onRejectProposed={rejectProposed}
              transform={transform}
              readOnly={readOnly}
            />
          )}
        </Box>
      </PageContainer>
      <ConfirmModal
        opened={isTurnOffIncrementalShown}
        title={t`Turn off incremental processing?`}
        message={t`Removing the table variable used by the incremental filter will turn off incremental processing for this transform, so it will reprocess all rows on every run.`}
        confirmButtonText={t`Turn off incremental processing`}
        onConfirm={handleConfirmTurnOffIncremental}
        onClose={closeTurnOffIncremental}
      />
      <LeaveRouteConfirmModal
        route={route as Route}
        isEnabled={isDirty && !isSaving}
        onConfirm={rejectProposed}
      />
    </>
  );
}

export type TransformQueryPageEditorUiState = ReturnType<
  typeof getInitialUiState
>;

export type TransformQueryPageEditorProps = {
  source: DraftTransformSource;
  proposedSource?: DraftTransformSource;
  uiState: TransformQueryPageEditorUiState;
  databases: Database[];
  setSourceAndRejectProposed: (source: DraftTransformSource) => void;
  setUiState: (uiState: TransformQueryPageEditorUiState) => void;
  isEditMode?: boolean;
  acceptProposed: () => void;
  rejectProposed: () => void;
  uiOptions?: TransformEditorProps["uiOptions"];
  onDryRunErrorChange?: (error: string | undefined) => void;
  onRunQueryStart?: (query: DatasetQuery) => boolean | void;
  onRunTransform?: (result: any) => void;
  onRun?: () => void;
};

export function TransformQueryPageEditor({
  source,
  proposedSource,
  uiState,

  uiOptions,
  databases,
  setSourceAndRejectProposed,
  setUiState,
  isEditMode = false,
  acceptProposed,
  rejectProposed,
  onDryRunErrorChange,
  onRunQueryStart,
  onRunTransform,
  onRun,
}: TransformQueryPageEditorProps) {
  return source.type === "python" ? (
    <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
      source={source}
      uiOptions={uiOptions}
      proposedSource={
        proposedSource?.type === "python" ? proposedSource : undefined
      }
      isEditMode={isEditMode}
      onChangeSource={setSourceAndRejectProposed}
      onAcceptProposed={acceptProposed}
      onRejectProposed={rejectProposed}
      onDryRunErrorChange={onDryRunErrorChange}
      onRunTransform={onRunTransform}
      onRun={onRun}
    />
  ) : (
    <TransformEditor
      source={source}
      proposedSource={
        proposedSource?.type === "query" ? proposedSource : undefined
      }
      uiState={uiState}
      uiOptions={uiOptions}
      databases={databases}
      isEditMode={isEditMode}
      onChangeSource={setSourceAndRejectProposed}
      onChangeUiState={setUiState}
      onAcceptProposed={acceptProposed}
      onRejectProposed={rejectProposed}
      onRunQueryStart={onRunQueryStart}
    />
  );
}
