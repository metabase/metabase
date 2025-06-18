import type * as React from "react";
import { t } from "ttag";

import { NudgeToPro } from "metabase/admin/people/components/NudgeToPro";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { AdminLayout } from "metabase/components/AdminLayout";
import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { useSelector } from "metabase/lib/redux";
import { Flex } from "metabase/ui";

export const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
  const shouldNudge = useSelector(shouldNudgeToPro) as boolean;

  return (
    <AdminLayout
      sidebar={
        <Flex direction="column" w="266px" flex="0 0 auto">
          <LeftNavPane>
            <LeftNavPaneItem name={t`People`} path="/admin/people" index />
            <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />
          </LeftNavPane>
          {shouldNudge && <NudgeToPro />}
        </Flex>
      }
    >
      {children}
    </AdminLayout>
  );
};
