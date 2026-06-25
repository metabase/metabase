import type { LocationDescriptor } from "history";
import { useEffect } from "react";
import type { Route } from "react-router";
import { replace } from "react-router-redux";

import { skipToken, useGetActionQuery, useGetCardQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { connect, useSelector } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import type { AppErrorDescriptor } from "metabase/redux/store";
import { getMetadata } from "metabase/selectors/metadata";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { WritebackAction } from "metabase-types/api";

import ActionCreator from "../ActionCreator";

interface OwnProps {
  params: {
    slug?: string;
    actionId?: string;
  };
  onClose: () => void;
}

interface EntityLoaderProps {
  action?: WritebackAction;
  model: Question;
  loading?: boolean;
}

interface RouteProps {
  route?: Route;
}

interface DispatchProps {
  setErrorPage: (error: AppErrorDescriptor) => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

type ActionCreatorModalProps = OwnProps &
  EntityLoaderProps &
  RouteProps &
  DispatchProps;

const mapDispatchToProps = {
  setErrorPage,
  onChangeLocation: replace,
};

function ActionCreatorModal({
  model,
  params,
  loading: isModelLoading,
  route,
  onClose,
  setErrorPage,
  onChangeLocation,
}: ActionCreatorModalProps) {
  const actionId = Urls.extractEntityId(params.actionId);
  const modelId = Urls.extractEntityId(params.slug);
  const databaseId = model.databaseId() ?? undefined;

  const { isLoading: isActionLoading, data: action } = useGetActionQuery(
    actionId === undefined ? skipToken : { id: actionId },
  );

  const loading = isModelLoading || isActionLoading;

  useEffect(() => {
    if (loading === false) {
      const notFound = actionId && !action;
      const hasModelMismatch = action != null && action.model_id !== modelId;

      if (notFound || action?.archived) {
        const nextLocation = Urls.modelDetail(model.card(), "actions");
        onChangeLocation(nextLocation);
      } else if (hasModelMismatch) {
        setErrorPage({ status: 404 });
      }
    }
    // We only need to run this once, when the action is fetched
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  if (loading) {
    return null;
  }

  return (
    <ActionCreator
      actionId={actionId}
      modelId={modelId}
      databaseId={databaseId}
      route={route}
      onClose={onClose}
    />
  );
}

function ActionCreatorModalLoader({
  params,
  onClose,
  ...dispatchProps
}: ModalComponentProps & DispatchProps) {
  const modelId = Urls.extractEntityId(params.slug);
  const { isLoading, error } = useGetCardQuery(
    modelId != null ? { id: modelId } : skipToken,
  );
  const model = useSelector((state) =>
    modelId != null ? getMetadata(state).question(modelId) : undefined,
  );

  if (isLoading || error != null || !model) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return (
    <ActionCreatorModal
      params={params}
      onClose={onClose}
      model={model}
      loading={isLoading}
      {...dispatchProps}
    />
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(ActionCreatorModalLoader);
