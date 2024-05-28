import { getParameters } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import {
  EmbedModal,
  EmbedModalContent,
} from "metabase/public/components/EmbedModal";
import type { Dashboard } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
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
  const updateDashboardEnableEmbedding = (enableEmbedding: boolean) =>
    dispatch(updateEnableEmbedding(dashboard, enableEmbedding));

  const updateDashboardEmbeddingParams = (embeddingParams: EmbedOptions) =>
    dispatch(updateEmbeddingParams(dashboard, embeddingParams));

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
          onUpdateEnableEmbedding={updateDashboardEnableEmbedding}
          onUpdateEmbeddingParams={updateDashboardEmbeddingParams}
          getPublicUrl={getPublicUrl}
        />
      )}
    </EmbedModal>
  );
};
