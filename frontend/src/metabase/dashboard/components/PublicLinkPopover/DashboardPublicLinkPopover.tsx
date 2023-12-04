import type { Dashboard } from "metabase-types/api";
import { createPublicLink, deletePublicLink } from "metabase/dashboard/actions";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { publicDashboard as getPublicDashboardUrl } from "metabase/lib/urls";
import { getSetting } from "metabase/selectors/settings";
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

  const siteUrl = useSelector(state => getSetting(state, "site-url"));
  const getPublicLink = () => {
    if (!uuid) {
      return null;
    }
    return getPublicDashboardUrl({ uuid, siteUrl });
  };

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
      uuid={uuid}
      getPublicLink={getPublicLink}
    />
  );
};
