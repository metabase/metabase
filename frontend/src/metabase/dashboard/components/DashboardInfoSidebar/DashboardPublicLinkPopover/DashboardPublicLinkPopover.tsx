import {
  useCreateDashboardPublicLinkMutation,
  useDeleteDashboardPublicLinkMutation,
} from "metabase/api";
import { PublicLinkPopover } from "metabase/embed/components/PublicLinkPopover/PublicLinkPopover";
import {
  trackPublicLinkCopied,
  trackPublicLinkRemoved,
} from "metabase/embed/lib/analytics";
import { publicDashboard as getPublicDashboardUrl } from "metabase/utils/urls";
import type { Dashboard } from "metabase-types/api";

export const DashboardPublicLinkPopover = ({
  dashboard,
  target,
  isOpen,
  onClose,
}: {
  dashboard: Dashboard;
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const uuid = dashboard.public_uuid;

  const url = uuid ? getPublicDashboardUrl(uuid) : null;

  const [createPublicDashboardLink] = useCreateDashboardPublicLinkMutation();
  const [deletePublicDashboardLink] = useDeleteDashboardPublicLinkMutation();

  const handleCreatePublicDashboardLink = async () => {
    await createPublicDashboardLink({
      id: dashboard.id,
    });
  };
  const handleDeletePublicDashboardLink = () => {
    trackPublicLinkRemoved({
      artifact: "dashboard",
      source: "public-share",
    });
    deletePublicDashboardLink({
      id: dashboard.id,
    });
  };

  const onCopyLink = () => {
    trackPublicLinkCopied({
      artifact: "dashboard",
    });
  };

  return (
    <PublicLinkPopover
      target={target}
      isOpen={isOpen}
      onClose={onClose}
      createPublicLink={handleCreatePublicDashboardLink}
      deletePublicLink={handleDeletePublicDashboardLink}
      url={url}
      onCopyLink={onCopyLink}
    />
  );
};
