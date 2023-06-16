import * as React from "react";
import { t } from "ttag";

import { LeftNavPane, LeftNavPaneItem } from "metabase/components/LeftNavPane";
import { NudgeToPro } from "metabase/admin/people/components/NudgeToPro";

import AdminLayout from "metabase/components/AdminLayout";
import { shouldNudgeToPro } from "metabase/admin/people/selectors";
import { useSelector } from "metabase/lib/redux";

const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
  const shouldNudge = useSelector(shouldNudgeToPro);
  const sidebar = (
    <LeftNavPane fullHeight={!shouldNudge}>
      <LeftNavPaneItem name={t`People`} path="/admin/people" index />
      <LeftNavPaneItem name={t`Groups`} path="/admin/people/groups" />
    </LeftNavPane>
  );
  return (
    <AdminLayout
      sidebar={
        !shouldNudge ? (
          sidebar
        ) : (
          <div className="flex flex-column">
            {sidebar}
            <NudgeToPro />
          </div>
        )
      }
    >
      {children}
    </AdminLayout>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AdminPeopleApp;
