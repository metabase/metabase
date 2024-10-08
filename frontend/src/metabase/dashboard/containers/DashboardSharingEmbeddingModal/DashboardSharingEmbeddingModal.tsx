import {
  useCreateDashboardPublicLinkMutation,
  useDeleteDashboardPublicLinkMutation,
} from "metabase/api";
import { getParameters } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import type { EmbeddingParameters } from "metabase/public/lib/types";
import type { Dashboard } from "metabase-types/api";

import { updateEmbeddingParams, updateEnableEmbedding } from "../../actions";

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

  const [createPublicDashboardLink] = useCreateDashboardPublicLinkMutation();
  const [deletePublicDashboardLink] = useDeleteDashboardPublicLinkMutation();
  const updateDashboardEnableEmbedding = (enable_embedding: boolean) =>
    dispatch(updateEnableEmbedding({ id: dashboard.id, enable_embedding }));

  const updateDashboardEmbeddingParams = (
    embedding_params: EmbeddingParameters,
  ) => dispatch(updateEmbeddingParams({ id: dashboard.id, embedding_params }));

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
          onCreatePublicLink={() =>
            createPublicDashboardLink({
              id: dashboard.id,
            })
          }
          onDeletePublicLink={() =>
            deletePublicDashboardLink({
              id: dashboard.id,
            })
          }
          onUpdateEnableEmbedding={updateDashboardEnableEmbedding}
          onUpdateEmbeddingParams={updateDashboardEmbeddingParams}
          getPublicUrl={getPublicUrl}
        />
      )}
    </EmbedModal>
  );
};
