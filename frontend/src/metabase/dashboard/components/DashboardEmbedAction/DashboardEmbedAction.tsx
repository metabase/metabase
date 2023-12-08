import { useState } from "react";
import type { Dashboard } from "metabase-types/api";
import { DashboardSharingEmbeddingModal } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal/DashboardSharingEmbeddingModal";
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
        resource={dashboard}
        resourceType="dashboard"
        hasPublicLink={!!dashboard.public_uuid}
        onModalOpen={() => setIsModalOpen(true)}
      />
      <DashboardSharingEmbeddingModal
        key="dashboard-embed"
        dashboard={dashboard}
        enabled={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isLinkEnabled={true}
      />
    </>
  );
};
