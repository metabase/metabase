import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { UpsellBetterSupport } from "metabase/admin/upsells";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { canAccessMonitoringTools } from "metabase/common/monitor/selectors";
import { getUserIsAdmin } from "metabase/current-user";
import { PLUGIN_SUPPORT } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { useLocation } from "metabase/router";
import { getIsPaidPlan } from "metabase/selectors/settings";
import { useSetting } from "metabase/settings";
import { Divider, Icon, NavLink, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName } from "metabase-types/api";

import { HelpAssistantRecentChats } from "./HelpAssistant";
import { useDiagnosticInfo } from "./use-diagnostic-info";
import { getGithubIssueUrl, getHelpUrl } from "./utils";

export function HelpNav() {
  const { tag } = useSetting("version");
  const isPaidPlan = useSelector(getIsPaidPlan);
  const canSeeLogs = useSelector(canAccessMonitoringTools);
  // Only admins can use the assistant.
  const isAdmin = useSelector(getUserIsAdmin);
  const { diagnosticInfo, compactDiagnosticInfo } = useDiagnosticInfo();
  const { pathname } = useLocation();

  return (
    <AdminNavWrapper justify="space-between" aria-label={t`Help`}>
      <Stack gap="xxs">
        {isAdmin && (
          <>
            <AdminNavItem
              icon="metabot"
              label={t`Help assistant`}
              path={Urls.adminHelp()}
            />
            <HelpAssistantRecentChats />
          </>
        )}
        <AdminNavItem
          icon="info"
          label={t`Diagnostic info`}
          path={Urls.adminHelpDiagnostics()}
        />
        {PLUGIN_SUPPORT.isEnabled && (
          <AdminNavItem
            icon="key"
            label={t`Support access`}
            path={Urls.adminHelpSupport()}
            // Stay highlighted while the grant-access modal route is open.
            active={pathname.startsWith(Urls.adminHelpSupport())}
          />
        )}
        <Divider my="sm" />
        <HelpNavExternalItem
          icon="document"
          label={t`Docs and support`}
          href={getHelpUrl({
            isPaidPlan,
            versionTag: tag,
            compactDiagnosticInfo,
          })}
        />
        <HelpNavExternalItem
          icon="bug"
          label={t`Report an issue`}
          href={getGithubIssueUrl(diagnosticInfo)}
        />
        {canSeeLogs && (
          <AdminNavItem
            icon="list"
            label={t`Application logs`}
            path={Urls.monitorLogs()}
            rightSection={<Icon name="chevronright" c="text-secondary" />}
          />
        )}
      </Stack>
      <UpsellBetterSupport location="settings-troubleshooting" variant="card" />
    </AdminNavWrapper>
  );
}

function HelpNavExternalItem({
  icon,
  label,
  href,
}: {
  icon: IconName;
  label: string;
  href: string;
}) {
  return (
    <NavLink
      component={ExternalLink}
      href={href}
      variant="secondary"
      label={label}
      mb="xxs"
      leftSection={<Icon name={icon} />}
      rightSection={<Icon name="external" c="text-secondary" />}
    />
  );
}
