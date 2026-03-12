import {
  useUpdateDashboardEmbeddingParamsMutation,
  useUpdateDashboardEnableEmbeddingMutation,
} from "metabase/api";
import { getParameters } from "metabase/dashboard/selectors";
import { STATIC_LEGACY_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSelector } from "metabase/lib/redux";
import { EmbedModal } from "metabase/public/components/EmbedModal";
import type { Dashboard } from "metabase-types/api";

export type DashboardSharingEmbeddingModalProps = {
  dashboard: Dashboard;
  isOpen: boolean;
  onBack?: () => void;
  onClose: () => void;
};

export const DashboardSharingEmbeddingModal = ({
  dashboard,
  isOpen,
  onBack,
  onClose,
}: DashboardSharingEmbeddingModalProps) => {
  const parameters = useSelector(getParameters);

  const [updateDashboardEmbeddingParams] =
    useUpdateDashboardEmbeddingParamsMutation();
  const [updateDashboardEnableEmbedding] =
    useUpdateDashboardEnableEmbeddingMutation();

  return (
    <EmbedModal
      isOpen={isOpen}
      resource={dashboard}
      resourceParameters={parameters}
      resourceType="dashboard"
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
      onBack={onBack}
      onClose={onClose}
    />
  );
};
