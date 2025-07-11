import { PLUGIN_DATA_APPS } from "metabase/plugins";
import { DataAppContainer } from "metabase-enterprise/data-apps/DataAppContainer";
import { DataAppsList } from "metabase-enterprise/data-apps/DataAppsList";
import { PublicDataApp } from "metabase-enterprise/data-apps/PublicDataApp";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { TokenFeature } from "metabase-types/api";

// eslint-disable-next-line no-constant-condition
if (true || hasPremiumFeature("data-apps" as TokenFeature)) {
  PLUGIN_DATA_APPS.isEnabled = () => true;
  PLUGIN_DATA_APPS.LIST_APPS_PAGE_COMPONENT = DataAppsList;
  PLUGIN_DATA_APPS.APP_PAGE_COMPONENT = DataAppContainer;
  PLUGIN_DATA_APPS.PUBLIC_APP_PAGE_COMPONENT = PublicDataApp;
}
