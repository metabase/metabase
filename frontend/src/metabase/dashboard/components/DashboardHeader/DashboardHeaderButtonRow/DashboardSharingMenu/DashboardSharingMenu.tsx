import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { useSetting } from "metabase/common/hooks";
import {
  getIsDashCardsRunning,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import {
  CopyLinkMenuItem,
  CopyPublicLinkMenuItem,
} from "metabase/embedding/components/SharingMenu/MenuItems/CopyLinkMenuItem";
import { EmbedMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/EmbedMenuItem";
import { ExportPdfMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import { SharingMenu } from "metabase/embedding/components/SharingMenu/SharingMenu";
import type { DashboardSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSharingModal } from "metabase/embedding/hooks/use-sharing-modal";
import { trackPublicLinkCopied } from "metabase/embedding/lib/analytics";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Flex } from "metabase/ui";
import {
  dashboard as getDashboardUrl,
  publicDashboard as getPublicDashboardUrl,
} from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { DashboardPublicLinkPopover } from "../../../DashboardInfoSidebar/DashboardPublicLinkPopover/DashboardPublicLinkPopover";

export function DashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const isAdmin = useSelector(getUserIsAdmin);

  if (dashboard.archived) {
    return null;
  }

  return isAdmin ? (
    <AdminDashboardSharingMenu dashboard={dashboard} />
  ) : (
    <NonAdminDashboardSharingMenu dashboard={dashboard} />
  );
}

// Copies the app link, pointing at the tab the user is looking at when there is one.
function CopyDashboardLinkMenuItem({ dashboard }: { dashboard: Dashboard }) {
  const siteUrl = useSetting("site-url");
  const selectedTabId = useSelector(getSelectedTabId);
  const hasMultipleTabs = (dashboard.tabs?.length ?? 0) > 1;
  const tabId =
    hasMultipleTabs && selectedTabId != null ? selectedTabId : undefined;

  return (
    <CopyLinkMenuItem
      url={`${siteUrl}${getDashboardUrl(dashboard, { tabId })}`}
    />
  );
}

function AdminDashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const { modalType, setModalType } =
    useSharingModal<DashboardSharingModalType>({
      resource: dashboard,
      resourceType: "dashboard",
    });
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);
  const canShare = !isAnalytics;

  return (
    <Flex>
      <SharingMenu>
        <CopyDashboardLinkMenuItem dashboard={dashboard} />
        {canShare && isPublicSharingEnabled && (
          <PublicLinkMenuItem
            hasPublicLink={Boolean(dashboard.public_uuid)}
            onClick={() => setModalType("dashboard-public-link")}
          />
        )}
        {canShare && (
          <EmbedMenuItem
            onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
          />
        )}
        <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
      </SharingMenu>
      {modalType === "dashboard-public-link" && (
        <DashboardPublicLinkPopover
          dashboard={dashboard}
          target={<Box h="2rem" />}
          isOpen
          onClose={() => setModalType(null)}
        />
      )}
    </Flex>
  );
}

// Non-admins can't create public links or embeds; they get the app link copy,
// the PDF export, and a public link copy when one already exists.
function NonAdminDashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const publicUuid = dashboard.public_uuid;

  return (
    <SharingMenu>
      <CopyDashboardLinkMenuItem dashboard={dashboard} />
      {publicUuid && (
        <CopyPublicLinkMenuItem
          url={getPublicDashboardUrl(publicUuid)}
          onCopied={() => trackPublicLinkCopied({ artifact: "dashboard" })}
        />
      )}
      <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
    </SharingMenu>
  );
}
