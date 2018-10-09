import React from "react";
import { t } from "c-3po";

import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

const NoDatabasesEmptyState = user => (
  <AdminAwareEmptyState
    title={t`Metabase is no fun without any data`}
    adminMessage={t`Your databases will appear here once you connect one`}
    message={t`Databases will appear here once your admins have added some`}
    image={"app/assets/img/databases-list"}
    adminAction={t`Connect a database`}
    adminLink={"/admin/databases/create"}
    user={user}
  />
);

export default NoDatabasesEmptyState;
