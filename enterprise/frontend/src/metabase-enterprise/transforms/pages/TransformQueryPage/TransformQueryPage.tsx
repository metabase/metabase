import { useLayoutEffect, useState } from "react";
import type { Route, RouteProps } from "react-router";
import { push } from "react-router-redux";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken, useListDatabasesQuery } from "metabase/api";
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
import { Flex, Stack } from "metabase/ui";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Database, Transform } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { TransformHeader } from "../../components/TransformHeader";
import { useRegisterMetabotTransformContext } from "../../hooks/use-register-transform-metabot-context";
import { useSourceState } from "../../hooks/use-source-state";
import { isNotDraftSource } from "../../utils";

import { TransformPaneHeaderActions } from "./TransformPaneHeaderActions";
import S from "./TransformQueryPage.module.css";

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
  const {
    data: databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useListDatabasesQuery({ include_analytics: true });
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
    />
  );
}

type TransformQueryPageBodyProps = {
  transform: Transform;
  databases: Database[];
  route: RouteProps;
};

function TransformQueryPageBody({
  transform,
  databases,
  route,
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
  const isEditMode = !!route.path?.includes("/edit");
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
      <Stack
        align="stretch"
        data-testid="transform-query-editor"
        gap={0}
        h="100%"
        mx="auto"
        pb="sm"
        pos="relative"
        px="3.5rem"
        w="100%"
      >
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
            />
          }
          hasMenu={!isEditMode && !isDirty}
          isEditMode={isEditMode}
        />
        <Flex gap={0} className={S.visualization}>
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
              readOnly={!isEditMode}
              databases={databases}
              onChangeSource={setSourceAndRejectProposed}
              onChangeUiState={setUiState}
              onAcceptProposed={acceptProposed}
              onRejectProposed={rejectProposed}
              transformId={transform.id}
            />
          )}
        </Flex>
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
        route={route as Route}
        isEnabled={isDirty && !isSaving && !isCheckingDependencies}
        onConfirm={rejectProposed}
      />
    </>
  );
}
