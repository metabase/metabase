import React from "react";
import { t } from "ttag";
import {
  PLUGIN_ADMIN_USER_MENU_ITEMS,
  PLUGIN_ADMIN_USER_MENU_ROUTES,
} from "metabase/plugins";
import { ModalRoute } from "metabase/hoc/ModalRoute";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import UnsubscribeUserModal from "./containers/UnsubscribeUserModal";

if (hasPremiumFeature("advanced_config")) {
  PLUGIN_ADMIN_USER_MENU_ITEMS.push(user => [
    {
      title: t`Unsubscribe from all subscriptions / alerts`,
      link: `/admin/people/${user.id}/unsubscribe`,
    },
  ]);

  PLUGIN_ADMIN_USER_MENU_ROUTES.push(() => {
    return <ModalRoute path="unsubscribe" modal={UnsubscribeUserModal} />;
  });
}
