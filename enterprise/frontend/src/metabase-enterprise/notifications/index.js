import React from "react";
import { PLUGIN_ADMIN_USER_MENU_ROUTES } from "metabase/plugins";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import UnsubscribeUserModal from "./containers/UnsubscribeUserModal";

PLUGIN_ADMIN_USER_MENU_ROUTES.push(() => {
  return <ModalRoute path="unsubscribe" modal={UnsubscribeUserModal} />;
});
