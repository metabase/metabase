import type * as React from "react";

import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";

import { EmbeddingNav } from "../components/EmbeddingNav";

export const AdminEmbeddingApp = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <AdminSettingsLayout sidebar={<EmbeddingNav />}>
      {children}
    </AdminSettingsLayout>
  );
};
