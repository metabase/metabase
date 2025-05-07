import type * as React from "react";
import { t } from "ttag";

import { NudgeToPro } from "metabase/admin/people/components/NudgeToPro";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { useSetting } from "metabase/common/hooks";
import { AdminLayout } from "metabase/components/AdminLayout";
import {
  LeftNavPane,
  LeftNavPaneItem,
  LeftNavPaneSectionTitle,
} from "metabase/components/LeftNavPane";
import { useSelector } from "metabase/lib/redux";
import { Divider, Flex } from "metabase/ui";

export const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
  const shouldNudge = useSelector(shouldNudgeToPro) as boolean;
  const tenantEnabled = useSetting("use-tenants");

  return (
    <AdminLayout
      sidebar={
        <Flex direction="column" w="266px" flex="0 0 auto">
          {tenantEnabled ? (
            <LeftNavPane>
              <LeftNavPaneSectionTitle>{t`Internal`}</LeftNavPaneSectionTitle>
              <LeftNavPaneItem name={t`People`} path="/admin/people" index />
              <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />

              <Divider m="md" />

              <LeftNavPaneSectionTitle>{t`External`}</LeftNavPaneSectionTitle>
              <LeftNavPaneItem name={t`Tenants`} path="/admin/tenants" index />
              <LeftNavPaneItem
                name={t`External Users`}
                path="/admin/tenants/people"
              />
            </LeftNavPane>
          ) : (
            <LeftNavPane>
              <LeftNavPaneItem name={t`People`} path="/admin/people" index />
              <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />
            </LeftNavPane>
          )}
          {shouldNudge && <NudgeToPro />}
        </Flex>
      }
    >
      {children}
    </AdminLayout>
  );
};
