import { useEffect, useLayoutEffect, useState } from "react";
import type { Route, RouteProps } from "react-router";
import { push } from "react-router-redux";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { EmptyState } from "metabase/common/components/EmptyState/EmptyState";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { Box, Center, Group, Icon } from "metabase/ui";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { useTransformPermissions } from "metabase-enterprise/transforms/hooks/use-transform-permissions";
import type {
  Database,
  DatasetQuery,
  DraftTransformSource,
  Transform,
} from "metabase-types/api";

import { useQueryComplexityChecks } from "../../components/QueryComplexityWarning";
import {
  TransformEditor,
  type TransformEditorProps,
} from "../../components/TransformEditor";
import { TransformHeader } from "../../components/TransformHeader";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { isCompleteSource } from "../../utils";

import { TransformPaneHeaderActions } from "./TransformPaneHeaderActions";

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
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const isEditMode = !readOnly && !!route.path?.includes("/edit");

  useRegisterMetabotTransformContext(transform, source);

  const { confirmIfQueryIsComplex, modal } = useQueryComplexityChecks();

  const {
    checkData,
    isCheckingDependencies,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckTransformDependencies({
    onSave: async (request) => {
      const { error } = await updateTransform(request);
      if (error) {
        sendErrorToast(t`Failed to update transform query`);
      } else {
        sendSuccessToast(t`Transform query updated`);

        if (isEditMode) {
          dispatch(push(Urls.transform(transform.id)));
        }
      }
    },
  });

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

  const handleSave = async () => {
    if (!isCompleteSource(source)) {
      return;
    }
    if ("source-incremental-strategy" in source) {
      const confirmed = await confirmIfQueryIsComplex(source);
      if (!confirmed) {
        return;
      }
    }

    await handleInitialSave({ id: transform.id, source });
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
                handleSave={handleSave}
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
          {!transform.source_readable ? (
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
            />
          ) : (
            <TransformEditor
              source={source}
              proposedSource={
                proposedSource?.type === "query" ? proposedSource : undefined
              }
              uiState={uiState}
              // todo: @uladzimirdev probably not the proper fix
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
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
      <LeaveRouteConfirmModal
        route={route as Route}
        isEnabled={isDirty && !isSaving && !isCheckingDependencies}
        onConfirm={rejectProposed}
      />
      {modal}
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
  onRunQueryStart?: (query: DatasetQuery) => boolean | void;
  onRunTransform?: (result: any) => void;
  /** Custom run handler for Python transforms (used in workspace for dry-run) */
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
