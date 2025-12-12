import {
  PLUGIN_ADMIN_ALLOWED_PATH_GETTERS,
  PLUGIN_GROUP_MANAGERS,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import {
  confirmDeleteMembership,
  confirmUpdateMembership,
  deleteGroup,
} from "./actions";
import { UserTypeCell } from "./components/UserTypeCell";
import { UserTypeToggle } from "./components/UserTypeToggle";
import {
  getChangeMembershipConfirmation,
  getRemoveMembershipConfirmation,
  groupManagerAllowedPathGetter,
} from "./utils";

/**
 * Initialize group_managers plugin features that depend on hasPremiumFeature.
 */
export function initializePlugin() {
  if (hasPremiumFeature("advanced_permissions")) {
    PLUGIN_ADMIN_ALLOWED_PATH_GETTERS.push(groupManagerAllowedPathGetter);

    PLUGIN_GROUP_MANAGERS.UserTypeCell = UserTypeCell;
    PLUGIN_GROUP_MANAGERS.UserTypeToggle = UserTypeToggle;

    PLUGIN_GROUP_MANAGERS.getRemoveMembershipConfirmation =
      getRemoveMembershipConfirmation;
    PLUGIN_GROUP_MANAGERS.getChangeMembershipConfirmation =
      getChangeMembershipConfirmation;

    PLUGIN_GROUP_MANAGERS.deleteGroup = deleteGroup;
    PLUGIN_GROUP_MANAGERS.confirmDeleteMembershipAction =
      confirmDeleteMembership;
    PLUGIN_GROUP_MANAGERS.confirmUpdateMembershipAction =
      confirmUpdateMembership;
  }
}
