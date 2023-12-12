import type { Dashboard } from "metabase-types/api";
import type { EmbedOptions } from "metabase-types/store";
import { useDispatch, useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { EmbedModal } from "metabase/public/components/widgets/EmbedModal";
import EmbedModalContent from "metabase/public/components/widgets/EmbedModalContent";
import { getParameters } from "metabase/dashboard/selectors";

import {
  createPublicLink,
  deletePublicLink,
  updateEnableEmbedding,
  updateEmbeddingParams,
} from "../../actions";

export type DashboardSharingEmbeddingModalProps = {
  isLinkEnabled: boolean;
  className?: string;
  dashboard: Dashboard;
  isOpen: boolean;
  onClose: () => void;
};

export const DashboardSharingEmbeddingModal = (
  props: DashboardSharingEmbeddingModalProps,
) => {
  const { className, dashboard, isOpen, onClose, isLinkEnabled } = props;

  const parameters = useSelector(getParameters);

  const dispatch = useDispatch();

  const createPublicDashboardLink = () => dispatch(createPublicLink(dashboard));
  const deletePublicDashboardLink = () => dispatch(deletePublicLink(dashboard));
  const updateDashboardEnableEmbedding = (enableEmbedding: boolean) =>
    dispatch(updateEnableEmbedding(dashboard, enableEmbedding));

  const updateDashboardEmbeddingParams = (embeddingParams: EmbedOptions) =>
    dispatch(updateEmbeddingParams(dashboard, embeddingParams));

  const getPublicUrl = ({ public_uuid }: { public_uuid: string }) =>
    Urls.publicDashboard(public_uuid);

  return (
    <EmbedModal isOpen={isOpen} onClose={onClose}>
      {({ embedType, setEmbedType }) => (
        <EmbedModalContent
          {...props}
          isLinkEnabled={isLinkEnabled ?? true}
          embedType={embedType}
          setEmbedType={setEmbedType}
          className={className}
          resource={dashboard}
          resourceParameters={parameters}
          resourceType="dashboard"
          onCreatePublicLink={createPublicDashboardLink}
          onDeletePublicLink={deletePublicDashboardLink}
          onUpdateEnableEmbedding={updateDashboardEnableEmbedding}
          onUpdateEmbeddingParams={updateDashboardEmbeddingParams}
          onClose={onClose}
          getPublicUrl={getPublicUrl}
        />
      )}
    </EmbedModal>
  );
};
