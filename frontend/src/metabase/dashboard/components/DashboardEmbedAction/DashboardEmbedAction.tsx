import { useState } from "react";

import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
import type { Dashboard } from "metabase-types/api";

import { EmbedMenu } from "../EmbedMenu";

export const DashboardEmbedAction = ({
  dashboard,
}: {
  dashboard: Dashboard;
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
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
  );
};
