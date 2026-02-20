import { useEffect } from "react";
import _ from "underscore";

import { skipToken, useGetActionQuery } from "metabase/api";
import { Questions } from "metabase/entities/questions";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { setErrorPage } from "metabase/redux/app";
import { useNavigation } from "metabase/routing/compat";
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
}

interface EntityLoaderProps {
  action?: WritebackAction;
  model: Question;
  loading?: boolean;
}

interface DispatchProps {
  setErrorPage: (error: AppErrorDescriptor) => void;
}

type ActionCreatorModalProps = OwnProps & EntityLoaderProps & DispatchProps;

const mapDispatchToProps = {
  setErrorPage,
};

function ActionCreatorModal({
  model,
  params,
  loading: isModelLoading,
  onClose,
  setErrorPage,
}: ActionCreatorModalProps) {
  const { replace } = useNavigation();
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
        replace(nextLocation);
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
      onClose={onClose}
    />
  );
}

function getModelId(state: State, { params }: OwnProps) {
  const { slug } = params;
  return Urls.extractEntityId(slug);
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Questions.load({
    id: getModelId,
    entityAlias: "model",
  }),
  connect(null, mapDispatchToProps),
)(ActionCreatorModal);
