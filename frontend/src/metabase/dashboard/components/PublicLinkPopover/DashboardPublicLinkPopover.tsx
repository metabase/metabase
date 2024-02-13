import type { Dashboard } from "metabase-types/api";
import { createPublicLink, deletePublicLink } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { publicDashboard as getPublicDashboardUrl } from "metabase/lib/urls";
import { PublicLinkPopover } from "./PublicLinkPopover";

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
  const dispatch = useDispatch();

  const uuid = dashboard.public_uuid;

  const url = uuid ? getPublicDashboardUrl(uuid) : null;

  const createPublicDashboardLink = async () => {
    await dispatch(createPublicLink(dashboard));
  };
  const deletePublicDashboardLink = () => {
    dispatch(deletePublicLink(dashboard));
  };

  return (
    <PublicLinkPopover
      target={target}
      isOpen={isOpen}
      onClose={onClose}
      createPublicLink={createPublicDashboardLink}
      deletePublicLink={deletePublicDashboardLink}
      url={url}
    />
  );
};
