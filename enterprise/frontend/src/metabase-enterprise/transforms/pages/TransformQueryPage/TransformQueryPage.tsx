import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useListDatabasesQuery } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import { Group, Stack } from "metabase/ui";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { PaneHeaderActions } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import * as Lib from "metabase-lib";
import type {
  Database,
  DraftTransformSource,
  Transform,
} from "metabase-types/api";

import {
  TransformEditor,
  type TransformEditorProps,
} from "../../components/TransformEditor";
import { TransformHeader } from "../../components/TransformHeader";
import { EditTransformMenu } from "../../components/TransformHeader/EditTransformMenu";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { getValidationResult, isNotDraftSource } from "../../utils";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
  route: Route;
};

export function TransformQueryPage({ params, route }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading: isLoadingTransform,
    error: transformError,
  } = useGetTransformQuery(transformId ?? skipToken);
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery({ include_analytics: true });
  const showEditWorkspaceMenu =
    transform?.source_type === "python" || transform?.source_type === "native";
  const isLoading = isLoadingTransform || isLoadingDatabases;
  const error = transformError || databasesError;

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null || databases == null) {
    return <LoadingAndErrorWrapper error={t`Transform not found.`} />;
  }

  return (
    <TransformQueryPageBody
      transform={transform}
      databases={databases.data}
      route={route}
      showEditWorkspaceMenu={showEditWorkspaceMenu}
    />
  );
}

type TransformQueryPageBodyProps = {
  transform: Transform;
  databases: Database[];
  route: Route;
  showEditWorkspaceMenu: boolean;
};

function TransformQueryPageBody({
  transform,
  databases,
  route,
  showEditWorkspaceMenu,
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
  const [uiState, setUiState] = useState(getInitialUiState);
  const metadata = useSelector(getMetadata);
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  useRegisterMetabotTransformContext(transform, source);

  const validationResult = useMemo(() => {
    return source.type === "query"
      ? getValidationResult(Lib.fromJsQueryAndMetadata(metadata, source.query))
      : PLUGIN_TRANSFORMS_PYTHON.getPythonSourceValidationResult(source);
  }, [source, metadata]);

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
      }
    },
  });

  const handleSave = async () => {
    if (isNotDraftSource(source)) {
      await handleInitialSave({
        id: transform.id,
        source,
      });
    }
  };

  const handleCancel = () => {
    setSourceAndRejectProposed(transform.source);
  };

  const handleResetRef = useLatest(() => {
    setSource(transform.source);
    setUiState(getInitialUiState());
  });

  useLayoutEffect(() => {
    handleResetRef.current();
  }, [transform.id, handleResetRef]);

  return (
    <>
      <Stack
        pos="relative"
        w="100%"
        h="100%"
        bg="bg-white"
        data-testid="transform-query-editor"
        gap={0}
      >
        <TransformHeader
          transform={transform}
          actions={
            <Group gap="sm">
              {showEditWorkspaceMenu && (
                <EditTransformMenu transform={transform} />
              )}
              <PaneHeaderActions
                errorMessage={validationResult.errorMessage}
                isValid={validationResult.isValid}
                isDirty={isDirty}
                isSaving={isSaving || isCheckingDependencies}
                onSave={handleSave}
                onCancel={handleCancel}
              />
            </Group>
          }
          hasMenu={!isDirty}
        />
        <TransformQueryPageEditor
          source={source}
          proposedSource={proposedSource}
          isDirty={isDirty}
          uiState={uiState}
          databases={databases}
          setSourceAndRejectProposed={setSourceAndRejectProposed}
          setUiState={setUiState}
          acceptProposed={acceptProposed}
          rejectProposed={rejectProposed}
        />
      </Stack>
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
      <LeaveRouteConfirmModal
        route={route}
        isEnabled={isDirty && !isSaving && !isCheckingDependencies}
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
  isDirty: boolean;
  uiState: TransformQueryPageEditorUiState;
  databases: Database[];
  setSourceAndRejectProposed: (source: DraftTransformSource) => void;
  setUiState: (uiState: TransformQueryPageEditorUiState) => void;
  acceptProposed: () => void;
  rejectProposed: () => void;
  uiOptions?: TransformEditorProps["uiOptions"];
};

export function TransformQueryPageEditor({
  source,
  proposedSource,
  isDirty,
  uiState,

  uiOptions,
  databases,
  setSourceAndRejectProposed,
  setUiState,
  acceptProposed,
  rejectProposed,
}: TransformQueryPageEditorProps) {
  return source.type === "python" ? (
    <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
      source={source}
      uiOptions={uiOptions}
      proposedSource={
        proposedSource?.type === "python" ? proposedSource : undefined
      }
      isDirty={isDirty}
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
      uiOptions={uiOptions}
      databases={databases}
      onChangeSource={setSourceAndRejectProposed}
      onChangeUiState={setUiState}
      onAcceptProposed={acceptProposed}
      onRejectProposed={rejectProposed}
    />
  );
}
