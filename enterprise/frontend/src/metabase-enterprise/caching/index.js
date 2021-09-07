import React from "react";
import { t, jt } from "ttag";
import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import Link from "metabase/components/Link";
import { CacheTTLField } from "./components/CacheTTLField";
import { DatabaseCacheTTLField } from "./components/DatabaseCacheTTLField";

PLUGIN_CACHING.cacheTTLFormField = {
  name: "cache_ttl",
  type: "cacheTTL",
};

function getDatabaseCacheTTLFieldDescription() {
  return (
    <span>
      {jt`How long to keep question results. By default, Metabase will use the value you supply on the ${(
        <Link
          className="text-brand"
          href="/admin/settings/caching"
        >{t`cache settings page`}</Link>
      )}, but if this database has other factors that influence the freshness of data, it could make sense to set a custom duration. You can also choose custom durations on individual questions or dashboards to help improve performance.`}
    </span>
  );
}

PLUGIN_CACHING.databaseCacheTTLFormField = {
  name: "cache_ttl",
  type: "databaseCacheTTL",
  title: t`Default result cache duration`,
  description: getDatabaseCacheTTLFieldDescription(),
  descriptionPosition: "bottom",
};

PLUGIN_FORM_WIDGETS.cacheTTL = CacheTTLField;
PLUGIN_FORM_WIDGETS.databaseCacheTTL = DatabaseCacheTTLField;
