import { useState } from "react";

import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import { getDashboardComplete } from "metabase/dashboard/selectors";
import { useSelector } from "metabase/lib/redux";

import { EmbedMenu } from "../EmbedMenu";

export const DashboardEmbedAction = () => {
  const dashboard = useSelector(getDashboardComplete);

  const [isModalOpen, setIsModalOpen] = useState(false);

  return dashboard ? (
    <>
      <EmbedMenu
        key="embed-menu"
        resource={dashboard}
        resourceType="dashboard"
        hasPublicLink={!!dashboard.public_uuid}
        onModalOpen={() => setIsModalOpen(true)}
      />
      <DashboardSharingEmbeddingModal
        key="dashboard-embed"
        dashboard={dashboard}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </>
  ) : null;
};
