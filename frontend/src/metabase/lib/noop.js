// there's nothing here!

import { EE_PLUGINS_SYSTEM } from "metabase/plugins";

// This file is the alternative to importing EE plugins.
// Either way we import something to ensure a consisten import order.

const activatePluginsSystem = () => {
  // console.log("noop deactivating plugins system");
  EE_PLUGINS_SYSTEM.activatePlugins = () => {};
};

export { activatePluginsSystem };
