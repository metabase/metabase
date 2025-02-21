import type { LocationDescriptor } from "history";
import { useEffect } from "react";
import type { Route } from "react-router";
import { replace } from "react-router-redux";
import _ from "underscore";

import { skipToken, useGetActionQuery } from "metabase/api";
import Questions from "metabase/entities/questions";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import type Question from "metabase-lib/v1/Question";
import type { WritebackAction } from "metabase-types/api";
import type { AppErrorDescriptor, State } from "metabase-types/store";

import ActionCreator from "../ActionCreator";

interface OwnProps {
  params: {
    slug: string;
    actionId?: string;
  };
  onClose: () => void;
  onChangeLocation: (location: LocationDescriptor) => void;
}

interface EntityLoaderProps {
  action?: WritebackAction;
  model: Question;
  loading?: boolean;
}

interface RouteProps {
  route: Route;
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
  const databaseId = model.databaseId();

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

function getModelId(state: State, props: OwnProps) {
  return Urls.extractEntityId(props.params.slug);
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: getModelId,
    entityAlias: "model",
  }),
  connect(null, mapDispatchToProps),
)(ActionCreatorModal);
