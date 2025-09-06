import type { ReactNode } from "react";
import { useEffect } from "react";
import { tinykeys } from "tinykeys";
import { t } from "ttag";

import {
  AdminNavItem,
  AdminNavWrapper,
} from "metabase/admin/components/AdminNav";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { useSelector } from "metabase/lib/redux";
import { getLocation } from "metabase/selectors/routing";
import { Box } from "metabase/ui";
import { MetabotChat } from "metabase-enterprise/metabot/components/MetabotChat";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks";

import { getJobListUrl, getRunListUrl, getTransformListUrl } from "../../urls";

type TransformPageLayoutParams = {
  transformId?: string;
  jobId?: string;
};

type TransformPageLayoutProps = {
  params: TransformPageLayoutParams;
  children?: ReactNode;
};

export function TransformPageLayout({
  params,
  children,
}: TransformPageLayoutProps) {
  const { startNewConversation, visible } = useMetabotAgent();

  useEffect(() => {
    // Register keyboard shortcut for Shift+M on all transform pages
    return tinykeys(window, {
      "Shift+m": (e) => {
        e.preventDefault();
        startNewConversation("");
      },
    });
  }, [startNewConversation, params]);

  // Wrapper component for MetabotChat that works in admin layout
  const MetabotSidebar = visible ? (
    <Box style={{ width: "30rem", height: "100%" }}>
      <MetabotChat />
    </Box>
  ) : undefined;

  return (
    <AdminSettingsLayout
      sidebar={<TransformSidebar params={params} />}
      rightSidebar={MetabotSidebar}
      maw="60rem"
    >
      {children}
    </AdminSettingsLayout>
  );
}

type TransformSidebarProps = {
  params: TransformPageLayoutParams;
};

function TransformSidebar({ params }: TransformSidebarProps) {
  const { transformId } = params;
  const location = useSelector(getLocation);
  const pathname = location?.pathname;
  const transformListUrl = getTransformListUrl();
  const jobListUrl = getJobListUrl();

  return (
    <AdminNavWrapper data-testid="transform-sidebar">
      <AdminNavItem
        label={t`Transforms`}
        path={transformListUrl}
        icon="refresh_downstream"
        active={pathname === transformListUrl || transformId != null}
      />
      <AdminNavItem
        label={t`Jobs`}
        path={jobListUrl}
        icon="play_outlined"
        active={pathname?.startsWith(jobListUrl)}
      />
      <AdminNavItem label={t`Runs`} path={getRunListUrl()} icon="list" />
    </AdminNavWrapper>
  );
}
