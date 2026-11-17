import { useEffect } from "react";

import { skipToken, useGetActionQuery, useGetCardQuery } from "metabase/api";
import { NotFound } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { useQuestionFromCard } from "metabase/metadata-store";
import { ActionCreator } from "metabase/querying/action-creator";
import { useDispatch } from "metabase/redux";
import { setErrorPage } from "metabase/redux/app";
import { useNavigate } from "metabase/router";
import { Modal, PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { WritebackAction } from "metabase-types/api";

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

type ActionCreatorModalProps = OwnProps & EntityLoaderProps;

function ActionCreatorModal({
  model,
  params,
  loading: isModelLoading,
  onClose,
}: ActionCreatorModalProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
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
        navigate(nextLocation, { replace: true });
      } else if (hasModelMismatch) {
        dispatch(setErrorPage({ status: 404 }));
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
      isRouted
      onClose={onClose}
    />
  );
}

function ActionCreatorModalLoader({ params, onClose }: ModalComponentProps) {
  const modelId = Urls.extractEntityId(params.slug);
  const {
    data: card,
    isLoading,
    error,
  } = useGetCardQuery(modelId != null ? { id: modelId } : skipToken);
  const model = useQuestionFromCard(card);

  return (
    <Modal
      {...PREVENT_AUTOCOMPLETE_CLIPPING_MODAL_PROPS}
      opened
      onClose={onClose}
      size="95%"
      withCloseButton={false}
      padding={0}
    >
      {modelId == null ? (
        <NotFound />
      ) : isLoading || error != null || !model ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <ActionCreatorModal params={params} onClose={onClose} model={model} />
      )}
    </Modal>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ActionCreatorModalLoader;
