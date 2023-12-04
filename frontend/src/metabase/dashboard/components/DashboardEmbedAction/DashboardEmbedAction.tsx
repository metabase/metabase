import { useState } from "react";
import type { Dashboard } from "metabase-types/api";
import { DashboardSharingEmbeddingModalConnected } from "metabase/dashboard/containers/DashboardSharingEmbeddingModal";
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
      <DashboardSharingEmbeddingModalConnected
        key="dashboard-embed"
        dashboard={dashboard}
        enabled={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isLinkEnabled={true}
      />
    </>
  );
};
