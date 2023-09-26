import type * as React from "react";
import { t } from "ttag";

import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { NudgeToPro } from "metabase/admin/people/components/NudgeToPro";

import AdminLayout from "metabase/components/AdminLayout";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { useSelector } from "metabase/lib/redux";
import { LeftNavWrapper } from "./AdminPeopleApp.styled";

export const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
  const shouldNudge = useSelector(shouldNudgeToPro);
  return (
    <AdminLayout
      sidebar={
        <LeftNavWrapper>
          <LeftNavPane fullHeight={!shouldNudge}>
            <LeftNavPaneItem name={t`People`} path="/admin/people" index />
            <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />
          </LeftNavPane>
          {shouldNudge && <NudgeToPro />}
        </LeftNavWrapper>
      }
    >
      {children}
    </AdminLayout>
  );
};
