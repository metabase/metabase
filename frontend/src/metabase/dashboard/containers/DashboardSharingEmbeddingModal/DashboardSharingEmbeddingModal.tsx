import type { Dashboard } from "metabase-types/api";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import { getParameters } from "metabase/dashboard/selectors";

import type { EmbeddingParameters } from "metabase/public/lib/types";
import {
  createPublicLink,
  deletePublicLink,
  publishEmbedding,
} from "../../actions";

export type DashboardSharingEmbeddingModalProps = {
  className?: string;
  dashboard: Dashboard;
  isOpen: boolean;
  onClose: () => void;
};

export const DashboardSharingEmbeddingModal = (
  props: DashboardSharingEmbeddingModalProps,
) => {
  const { className, dashboard, isOpen, onClose } = props;

  const parameters = useSelector(getParameters);

  const dispatch = useDispatch();

  const createPublicDashboardLink = () => dispatch(createPublicLink(dashboard));
  const deletePublicDashboardLink = () => dispatch(deletePublicLink(dashboard));

  const publishEmbeddingWithParams = (
    enable_embedding: boolean,
    embedding_params: EmbeddingParameters,
  ) =>
    dispatch(
      publishEmbedding({
        id: dashboard.id,
        enable_embedding,
        embedding_params,
      }),
    );

  const getPublicUrl = (publicUuid: string) => Urls.publicDashboard(publicUuid);

  return (
    <EmbedModal isOpen={isOpen} onClose={onClose}>
      {({ embedType, goToNextStep }) => (
        <EmbedModalContent
          embedType={embedType}
          goToNextStep={goToNextStep}
          className={className}
          resource={dashboard}
          resourceParameters={parameters}
          resourceType="dashboard"
          onCreatePublicLink={createPublicDashboardLink}
          onDeletePublicLink={deletePublicDashboardLink}
          onPublishEmbedding={publishEmbeddingWithParams}
          getPublicUrl={getPublicUrl}
        />
      )}
    </EmbedModal>
  );
};
