import type * as React from "react";

import { SettingsSection } from "metabase/admin/settings/components/SettingsSection";
import { AdminSettingsLayout } from "metabase/components/AdminLayout/AdminSettingsLayout";

import { PeopleNav } from "../components/PeopleNav";

export const AdminPeopleApp = ({ children }: { children: React.ReactNode }) => {
  return (
    <AdminSettingsLayout sidebar={<PeopleNav />}>
      <SettingsSection>{children}</SettingsSection>
    </AdminSettingsLayout>
  );
};
