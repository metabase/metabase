import { createPublicLink, deletePublicLink } from "metabase/dashboard/actions";
import { useDispatch } from "metabase/lib/redux";
import { publicDashboard as getPublicDashboardUrl } from "metabase/lib/urls";
import {
  trackPublicLinkCopied,
  trackPublicLinkRemoved,
} from "metabase/public/lib/analytics";
import type { Dashboard } from "metabase-types/api";

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
    trackPublicLinkRemoved({
      artifact: "dashboard",
      source: "public-share",
    });
    dispatch(deletePublicLink(dashboard));
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
      createPublicLink={createPublicDashboardLink}
      deletePublicLink={deletePublicDashboardLink}
      url={url}
      onCopyLink={onCopyLink}
    />
  );
};
