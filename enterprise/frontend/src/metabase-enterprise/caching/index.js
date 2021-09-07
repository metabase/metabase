import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import { CacheTTLField } from "./components/CacheTTLField";

PLUGIN_CACHING.cacheTTLFormField = {
  name: "cache_ttl",
  type: "cacheTTL",
};

PLUGIN_FORM_WIDGETS.cacheTTL = CacheTTLField;
