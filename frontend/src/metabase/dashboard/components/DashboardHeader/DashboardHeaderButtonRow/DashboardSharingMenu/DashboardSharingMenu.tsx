import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { useSetting } from "metabase/common/hooks";
import {
  getIsDashCardsRunning,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import {
  AdminSharingMenu,
  CopyLinkButton,
  EmbedButton,
} from "metabase/embedding/components/SharingMenu/AdminSharingMenu";
import { LinkCopiedTooltipLabel } from "metabase/embedding/components/SharingMenu/LinkCopiedTooltipLabel";
import { ExportPdfMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/ExportPdfMenuItem";
import { PublicLinkMenuItem } from "metabase/embedding/components/SharingMenu/MenuItems/PublicLinkMenuItem";
import {
  SHARING_MENU_WIDTH,
  SharingMenu,
} from "metabase/embedding/components/SharingMenu/SharingMenu";
import type { DashboardSharingModalType } from "metabase/embedding/components/SharingMenu/types";
import { GUEST_EMBED_EMBEDDING_TYPE } from "metabase/embedding/constants";
import { useSharingModal } from "metabase/embedding/hooks/use-sharing-modal";
import { trackPublicLinkCopied } from "metabase/embedding/lib/analytics";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Box,
  CopyButton,
  Flex,
  Group,
  Icon,
  Menu,
  Stack,
  Tooltip,
} from "metabase/ui";
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
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isAnalytics =
    dashboard.collection && isInstanceAnalyticsCollection(dashboard.collection);
  const canShare = !isAnalytics;

  return (
    <Flex>
      <AdminSharingMenu>
        <Group p="lg" gap="md" wrap="nowrap">
          <CopyDashboardLinkButton dashboard={dashboard} />
          {canShare && (
            <EmbedButton
              onClick={() => setModalType(GUEST_EMBED_EMBEDDING_TYPE)}
            />
          )}
        </Group>
        <Menu.Divider />
        <Stack p="md" gap="sm">
          <ExportPdfMenuItem
            dashboard={dashboard}
            loading={isDashCardsRunning}
          />
          {canShare && isPublicSharingEnabled && (
            <PublicLinkMenuItem
              hasPublicLink={Boolean(dashboard.public_uuid)}
              onClick={() => setModalType("dashboard-public-link")}
            />
          )}
        </Stack>
      </AdminSharingMenu>
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

// Non-admins can't create public links or embeds; when a public link already
// exists they get a "Copy link" item for it, plus the PDF export.
function NonAdminDashboardSharingMenu({ dashboard }: { dashboard: Dashboard }) {
  const isDashCardsRunning = useSelector(getIsDashCardsRunning);
  const publicUuid = dashboard.public_uuid;

  return (
    <SharingMenu
      width={SHARING_MENU_WIDTH}
      styles={{ dropdown: { padding: 0 } }}
    >
      <Stack p="md" gap="sm">
        {publicUuid && (
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
        )}
        <ExportPdfMenuItem dashboard={dashboard} loading={isDashCardsRunning} />
      </Stack>
    </SharingMenu>
  );
}
