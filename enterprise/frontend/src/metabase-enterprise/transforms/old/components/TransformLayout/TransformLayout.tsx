import type { ReactNode } from "react";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

export type TransformLayoutProps = {
  children?: ReactNode;
};

export function TransformLayout({ children }: TransformLayoutProps) {
  return (
    <AdminSettingsLayout sidebar={<div />}>{children}</AdminSettingsLayout>
  );
}
