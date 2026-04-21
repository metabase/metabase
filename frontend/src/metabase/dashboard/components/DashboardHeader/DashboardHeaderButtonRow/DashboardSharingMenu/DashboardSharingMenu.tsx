import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { getIsDashCardsRunning } from "metabase/dashboard/selectors";
import { EmbedMenuItem } from "metabase/embed/components/SharingMenu/MenuItems/EmbedMenuItem";
import { ExportPdfMenuItem } from "metabase/embed/components/SharingMenu/MenuItems/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "metabase/embed/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import { SharingMenu } from "metabase/embed/components/SharingMenu/SharingMenu";
import type { DashboardSharingModalType } from "metabase/embed/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embed/constants";
import { useSharingModal } from "metabase/embed/hooks/use-sharing-modal";
import { Box, Flex, Menu } from "metabase/ui";
import { useSelector } from "metabase/utils/redux";
import type { Dashboard } from "metabase-types/api";

import { DashboardPublicLinkPopover } from "../../../DashboardInfoSidebar/DashboardPublicLinkPopover/DashboardPublicLinkPopover";

export function DashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const { modalType, setModalType } =
    useSharingModal<DashboardSharingModalType>({
      resource: dashboard,
      resourceType: "dashboard",
    });

  const hasPublicLink = !!dashboard?.public_uuid;
  const isArchived = dashboard.archived;
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);

  const canShare = !isAnalytics;
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);

  if (isArchived) {
    return null;
  }

  return (
    <Flex>
      <SharingMenu>
        <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
        {canShare && (
          <>
            <Menu.Divider />
            <PublicLinkMenuItem
              hasPublicLink={hasPublicLink}
              onClick={() => setModalType("dashboard-public-link")}
            />
            <EmbedMenuItem
              onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
            />
          </>
        )}
      </SharingMenu>
      <DashboardPublicLinkPopover
        dashboard={dashboard}
        target={<Box h="2rem" />}
        isOpen={modalType === "dashboard-public-link"}
        onClose={() => setModalType(null)}
      />
    </Flex>
  );
}
