import { useState } from "react";

import { useSetting } from "metabase/common/hooks";
import { setSharing as setDashboardSubscriptionSidebarOpen } from "metabase/dashboard/actions";
import { getIsSharing as getIsDashboardSubscriptionSidebarOpen } from "metabase/dashboard/selectors";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Menu } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { DashboardSubscriptionMenuItem } from "./MenuItems/DashboardSubscriptionMenuItem";
import { EmbedMenuItem } from "./MenuItems/EmbedMenuItem";
import { ExportPdfMenuItem } from "./MenuItems/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "./MenuItems/PublicLinkMenuItem";
import { SharingMenu } from "./SharingMenu";
import { SharingModals } from "./SharingModals";
import type { DashboardSharingModalType } from "./types";

export function DashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const dispatch = useDispatch();

  const isDashboardSubscriptionSidebarOpen = useSelector(
    getIsDashboardSubscriptionSidebarOpen,
  );
  const toggleSubscriptionSidebar = () =>
    dispatch(
      setDashboardSubscriptionSidebarOpen(!isDashboardSubscriptionSidebarOpen),
    );

  const [modalType, setModalType] = useState<DashboardSharingModalType | null>(
    null,
  );

  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isEmbeddingEnabled = useSetting("enable-embedding");
  const isAdmin = useSelector(getUserIsAdmin);

  const hasPublicLink = !!dashboard?.public_uuid;
  const canShare = isAdmin || isPublicSharingEnabled || isEmbeddingEnabled;

  return (
    <>
      <SharingModals
        modalType={modalType}
        dashboard={dashboard}
        onClose={() => setModalType(null)}
      />
      <SharingMenu>
        <DashboardSubscriptionMenuItem onClick={toggleSubscriptionSidebar} />
        <ExportPdfMenuItem dashboard={dashboard} />
        {!!canShare && <Menu.Divider />}
        <PublicLinkMenuItem
          hasPublicLink={hasPublicLink}
          onClick={() => setModalType("dashboard-public-link")}
        />
        <EmbedMenuItem onClick={() => setModalType("dashboard-embed")} />
      </SharingMenu>
    </>
  );
}
