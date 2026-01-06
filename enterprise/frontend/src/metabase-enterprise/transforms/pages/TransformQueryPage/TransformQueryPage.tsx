import { useEffect, useLayoutEffect, useState } from "react";
import type { Route, RouteProps } from "react-router";
import { push } from "react-router-redux";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { getInitialUiState } from "metabase/querying/editor/components/QueryEditor";
import { Box } from "metabase/ui";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { PageContainer } from "metabase-enterprise/data-studio/common/components/PageContainer";
import { useTransformPermissions } from "metabase-enterprise/transforms/hooks/use-transform-permissions";
import type { Database, Transform } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { TransformHeader } from "../../components/TransformHeader";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { isNotDraftSource } from "../../utils";

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
  const [uiState, setUiState] = useState(getInitialUiState);
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const isEditMode = !readOnly && !!route.path?.includes("/edit");

  useRegisterMetabotTransformContext(transform, source);

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

  const handleSave = async () => {
    if (isNotDraftSource(source)) {
      await handleInitialSave({
        id: transform.id,
        source,
      });

      if (isEditMode) {
        dispatch(push(Urls.transform(transform.id)));
      }
    }
  };

  const handleCancel = () => {
    setSourceAndRejectProposed(transform.source);

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
            <TransformPaneHeaderActions
              source={source}
              isSaving={isSaving}
              isDirty={isDirty}
              handleSave={handleSave}
              handleCancel={handleCancel}
              transformId={transform.id}
              isEditMode={isEditMode}
              readOnly={readOnly}
            />
          }
          hasMenu={!isEditMode && !isDirty}
          isEditMode={isEditMode}
          readOnly={readOnly}
        />
        <Box
          w="100%"
          bg="bg-white"
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
              readOnly={readOnly}
              isEditMode={isEditMode}
              databases={databases}
              onChangeSource={setSourceAndRejectProposed}
              onChangeUiState={setUiState}
              onAcceptProposed={acceptProposed}
              onRejectProposed={rejectProposed}
              transformId={transform.id}
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
    </>
  );
}
