import React from "react";
import { t, jt } from "ttag";
import { PLUGIN_CACHING, PLUGIN_FORM_WIDGETS } from "metabase/plugins";
import Link from "metabase/components/Link";
import { CacheTTLField } from "./components/CacheTTLField";
import { DatabaseCacheTTLField } from "./components/DatabaseCacheTTLField";
import { QuestionCacheTTLField } from "./components/QuestionCacheTTLField";
import {
  getQuestionsImplicitCacheTTL,
  validateCacheTTL,
  normalizeCacheTTL,
} from "./utils";

PLUGIN_CACHING.getQuestionsImplicitCacheTTL = getQuestionsImplicitCacheTTL;

PLUGIN_CACHING.cacheTTLFormField = {
  name: "cache_ttl",
  validate: validateCacheTTL,
  normalize: normalizeCacheTTL,
};

function getDatabaseCacheTTLFieldDescription() {
  return (
    <span>
      {jt`How long to keep question results. By default, Metabase will use the value you supply on the ${(
        <Link
          key="caching-link"
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
  validate: validateCacheTTL,
  normalize: normalizeCacheTTL,
};

PLUGIN_FORM_WIDGETS.dashboardCacheTTL = CacheTTLField;
PLUGIN_FORM_WIDGETS.databaseCacheTTL = DatabaseCacheTTLField;
PLUGIN_FORM_WIDGETS.questionCacheTTL = QuestionCacheTTLField;
