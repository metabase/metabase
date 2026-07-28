import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import { useSetting } from "metabase/common/hooks";
import {
  getIsDashCardsRunning,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import { CopyLinkButton } from "metabase/embedding/components/SharingMenu/ActionButtons/CopyLinkButton";
import { EmbedButton } from "metabase/embedding/components/SharingMenu/ActionButtons/EmbedButton";
import { InviteToViewModal } from "metabase/embedding/components/SharingMenu/InviteToViewModal";
import { CopyPublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/CopyPublicLinkMenuItem";
import { ExportPdfMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/ExportPdfMenuItem";
import { InviteToViewMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/InviteToViewMenuItem";
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
import type { Dashboard, InviteTarget } from "metabase-types/api";

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
function CopyDashboardLinkButton({ dashboard }: { dashboard: Dashboard }) {
  const siteUrl = useSetting("site-url");
  const selectedTabId = useSelector(getSelectedTabId);
  const hasMultipleTabs = (dashboard.tabs?.length ?? 0) > 1;
  const tabId =
    hasMultipleTabs && selectedTabId != null ? selectedTabId : undefined;

  return (
    <CopyLinkButton
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
  const [isInviteOpen, { open: openInvite, close: closeInvite }] =
    useDisclosure();
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const siteUrl = useSetting("site-url");
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);
  const canShare = !isAnalytics;
  // Creating a public link is a write, so hide that action when the dashboard is
  // not writable (e.g. a remote-synced entity on a read-only instance). An
  // existing public link stays visible either way — viewing and copying it are
  // reads. Embedding stays available; its Publish button is disabled instead.
  const canWrite = canShare && dashboard.can_write;
  const hasPublicLink = Boolean(dashboard.public_uuid);
  // x-ray dashboards have string ids and can't be invite targets.
  const inviteTarget: InviteTarget | undefined =
    typeof dashboard.id === "number"
      ? { type: "dashboard", id: dashboard.id, name: dashboard.name }
      : undefined;

  return (
    <Flex>
      <SharingMenu
        actions={
          <>
            <CopyDashboardLinkButton dashboard={dashboard} />
            {canShare && (
              <EmbedButton
                onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
              />
            )}
          </>
        }
      >
        <InviteToViewMenuItem onClick={openInvite} />
        <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
        {canShare && isPublicSharingEnabled && (hasPublicLink || canWrite) && (
          <PublicLinkMenuItem
            hasPublicLink={hasPublicLink}
            onClick={() => setModalType("dashboard-public-link")}
          />
        )}
      </SharingMenu>
      {modalType === "dashboard-public-link" && (
        <DashboardPublicLinkPopover
          dashboard={dashboard}
          target={<Box h="2rem" />}
          isOpen
          onClose={() => setModalType(null)}
        />
      )}
      {isInviteOpen && (
        <InviteToViewModal
          title={t`Invite someone to view this dashboard`}
          shareUrl={`${siteUrl}${getDashboardUrl(dashboard)}`}
          triggeredFrom="dashboard"
          inviteTarget={inviteTarget}
          onClose={closeInvite}
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
    <SharingMenu actions={<CopyDashboardLinkButton dashboard={dashboard} />}>
      <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
      {publicUuid && (
        <CopyPublicLinkMenuItem
          url={getPublicDashboardUrl(publicUuid)}
          onCopied={() => trackPublicLinkCopied({ artifact: "dashboard" })}
        />
      )}
    </SharingMenu>
  );
}
