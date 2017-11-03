import * as React from "react";
import AdminAwareEmptyState from "metabase/components/AdminAwareEmptyState";

const NoDatabasesEmptyState = (user) =>
    <AdminAwareEmptyState
        title={"Metabase is no fun without any data"}
        adminMessage={"Your databases will appear here once you connect one"}
        message={"Databases will appear here once your admins have added some"}
        image={"app/assets/img/databases-list"}
        adminAction={"Connect a database"}
        adminLink={"/admin/databases/create"}
        user={user}
    />

export default NoDatabasesEmptyState