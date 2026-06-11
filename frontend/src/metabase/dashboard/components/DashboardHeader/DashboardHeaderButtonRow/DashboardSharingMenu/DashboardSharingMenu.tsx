import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { getIsDashCardsRunning } from "metabase/dashboard/selectors";
import { LinkCopiedTooltipLabel } from "metabase/embedding/components/SharingMenu/LinkCopiedTooltipLabel";
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
import { Box, CopyButton, Flex, Icon, Menu, Tooltip } from "metabase/ui";
import { publicDashboard as getPublicDashboardUrl } from "metabase/urls";
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

function AdminDashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const { modalType, setModalType } =
    useSharingModal<DashboardSharingModalType>({
      resource: dashboard,
      resourceType: "dashboard",
    });
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);
  const canShare = !isAnalytics;

  return (
    <Flex>
      <SharingMenu>
        <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
        {canShare && (
          <>
            <Menu.Divider />
            <PublicLinkMenuItem
              hasPublicLink={Boolean(dashboard.public_uuid)}
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

// Non-admins can't create public links or embeds; besides the PDF export they
// only get a "Copy link" item when a public link already exists.
function NonAdminDashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const publicUuid = dashboard.public_uuid;
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);
  const canShare = !isAnalytics;

  return (
    <SharingMenu>
      <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
      {canShare && publicUuid && (
        <>
          <Menu.Divider />
          <CopyButton value={getPublicDashboardUrl(publicUuid)} timeout={2000}>
            {({ copied, copy }) => (
              <Tooltip label={<LinkCopiedTooltipLabel />} opened={copied}>
                <Menu.Item
                  leftSection={<Icon name="link" aria-hidden />}
                  closeMenuOnClick={false}
                  onClick={() => {
                    copy();
                    trackPublicLinkCopied({ artifact: "dashboard" });
                  }}
                >
                  {t`Copy link`}
                </Menu.Item>
              </Tooltip>
            )}
          </CopyButton>
        </>
      )}
    </SharingMenu>
  );
}
