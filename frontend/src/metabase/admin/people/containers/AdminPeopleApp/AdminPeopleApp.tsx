import type * as React from "react";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { PeopleNav } from "../../components/PeopleNav";

export const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <AdminSettingsLayout sidebar={<PeopleNav />} maw="80rem">
      {children}
    </AdminSettingsLayout>
  );
};
