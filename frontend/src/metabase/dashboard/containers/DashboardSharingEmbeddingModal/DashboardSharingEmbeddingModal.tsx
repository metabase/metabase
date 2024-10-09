import {
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { getParameters } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import type { Dashboard } from "metabase-types/api";

import { createPublicLink, deletePublicLink } from "../../actions";

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

  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();

  const createPublicDashboardLink = () => dispatch(createPublicLink(dashboard));
  const deletePublicDashboardLink = () => dispatch(deletePublicLink(dashboard));

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
          onUpdateEnableEmbedding={enable_embedding =>
            updateDashboardEnableEmbedding({
              id: dashboard.id,
              enable_embedding,
            })
          }
          onUpdateEmbeddingParams={embedding_params =>
            updateDashboardEmbeddingParams({
              id: dashboard.id,
              embedding_params,
            })
          }
          getPublicUrl={getPublicUrl}
        />
      )}
    </EmbedModal>
  );
};
