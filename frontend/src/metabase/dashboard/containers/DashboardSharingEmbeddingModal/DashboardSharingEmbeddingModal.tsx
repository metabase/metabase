import {
  useCreateDashboardPublicLinkMutation,
  useDeleteDashboardPublicLinkMutation,
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { getParameters } from "metabase/dashboard/selectors";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import type { Dashboard } from "metabase-types/api";

export type DashboardSharingEmbeddingModalProps = {
  className?: string;
  dashboard: Dashboard;
  isOpen: boolean;
  onClose: () => void;
};

export const DashboardSharingEmbeddingModal = ({
  className,
  dashboard,
  isOpen,
  onClose,
}: DashboardSharingEmbeddingModalProps) => {
  const parameters = useSelector(getParameters);

  const [createPublicDashboardLink] = useCreateDashboardPublicLinkMutation();
  const [deletePublicDashboardLink] = useDeleteDashboardPublicLinkMutation();
  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();

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
            createPublicDashboardLink({ id: dashboard.id })
          }
          onDeletePublicLink={() =>
            deletePublicDashboardLink({ id: dashboard.id })
          }
          onUpdateEnableEmbedding={(enable_embedding) =>
            updateDashboardEnableEmbedding({
              id: dashboard.id,
              enable_embedding,
              embedding_type: enable_embedding
                ? STATIC_LEGACY_EMBEDDING_TYPE
                : null,
            })
          }
          onUpdateEmbeddingParams={(embedding_params) =>
            updateDashboardEmbeddingParams({
              id: dashboard.id,
              embedding_params,
              embedding_type: STATIC_LEGACY_EMBEDDING_TYPE,
            })
          }
          getPublicUrl={getPublicUrl}
          onClose={onClose}
        />
      )}
    </EmbedModal>
  );
};
