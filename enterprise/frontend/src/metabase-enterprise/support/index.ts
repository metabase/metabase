import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import {
  PLUGIN_IS_EE_BUILD,
  PLUGIN_SUPPORT,
  lazyPluginComponent,
  lazyPluginSlot,
} from "metabase/plugins";
import { hasPremiumFeature } from "metabase-enterprise/settings";

const supportSettings = () => import("./components/SupportSettingsSection");

export function initializePlugin() {
  if (hasPremiumFeature("support-users") && PLUGIN_IS_EE_BUILD.isEEBuild()) {
    PLUGIN_SUPPORT.isEnabled = true;
    PLUGIN_SUPPORT.SupportSettings = lazyPluginComponent(() =>
      supportSettings().then(
        ({ SupportSettingsSection }) => SupportSettingsSection,
      ),
    );
    PLUGIN_SUPPORT.GrantAccessModal = lazyPluginSlot<ModalComponentProps>(() =>
      supportSettings().then(({ GrantAccessModal }) => GrantAccessModal),
    );
  }
}
