import { ModalRoute } from "metabase/hoc/ModalRoute";
import { PLUGIN_TENANTS } from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { EditUserStrategyModal } from "./EditUserStrategyModal";
import { EditUserStrategySettingsButton } from "./EditUserStrategySettingsButton";

// TODO remove `true` once feature is enabled for dev token
// eslint-disable-next-line no-constant-condition
if (true || hasPremiumFeature("tenants")) {
  PLUGIN_TENANTS.userStrategyRoute = (
    <ModalRoute path="user-strategy" modal={EditUserStrategyModal} noWrap />
  );

  PLUGIN_TENANTS.EditUserStrategySettingsButton =
    EditUserStrategySettingsButton;
}
