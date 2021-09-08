import React from "react";
import { t } from "ttag";
import _ from "underscore";
import {
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
} from "metabase/plugins";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import UnsubscribeUserModal from "./containers/UnsubscribeUserModal";

PLUGIN_ADMIN_USER_MENU_ITEMS.push((items, user) => {
  return [
    ..._.initial(items),
    {
      title: t`Unsubscribe from all subscriptions / alerts`,
      link: `/admin/people/${user.id}/unsubscribe`,
    },
    _.last(items),
  ];
});

PLUGIN_ADMIN_USER_MENU_ROUTES.push(() => {
  return <ModalRoute path="unsubscribe" modal={UnsubscribeUserModal} />;
});
