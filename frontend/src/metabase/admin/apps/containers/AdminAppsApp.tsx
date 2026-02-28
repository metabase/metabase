import type { ReactNode } from "react";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

interface AdminAppsAppProps {
  children?: ReactNode;
}

export function AdminAppsApp({ children }: AdminAppsAppProps) {
  return <AdminSettingsLayout>{children}</AdminSettingsLayout>;
}
