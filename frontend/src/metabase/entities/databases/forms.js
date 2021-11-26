import React from "react";
import { t, jt } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import {
  getElevatedEngines,
  getEngineSupportsFirewall,
} from "metabase/lib/engine";
import ExternalLink from "metabase/components/ExternalLink";
import { PLUGIN_CACHING } from "metabase/plugins";
import getFieldsForBigQuery from "./big-query-fields";

import getFieldsForMongo from "./mongo-fields";
import MetadataSyncScheduleWidget from "metabase/admin/databases/components/widgets/MetadataSyncScheduleWidget";
import CacheFieldValuesScheduleWidget from "metabase/admin/databases/components/widgets/CacheFieldValuesScheduleWidget";
import EngineWidget from "metabase/admin/databases/components/widgets/EngineWidget";

const DATABASE_DETAIL_OVERRIDES = {
  "tunnel-enabled": () => ({
    title: t`Use an SSH-tunnel`,
    description: getSshDescription(),
  }),
  "use-jvm-timezone": () => ({
    title: t`Use the Java Virtual Machine (JVM) timezone`,
    description: t`We suggest you leave this off unless you plan on doing a lot of manual timezone casting with this data.`,
  }),
  "include-user-id-and-hash": () => ({
    title: t`Include User ID and query hash in queries`,
    description: t`This can be useful for auditing and debugging, but prevents BigQuery from caching results and may increase your costs.`,
  }),
  "use-srv": () => ({
    title: t`Connect using DNS SRV`,
    description: t`If you're connecting to an Atlas cluster, you might need to turn this on. Note that your provided host must be a fully qualified domain name.`,
  }),
  "service-account-json": (engine, details, id) => ({
    validate: value => {
      // this field is only required if this is a new entry
      if (id) {
        return null;
      }

      if (!value) {
        return t`required`;
      }
      try {
        JSON.parse(value);
      } catch (e) {
        return t`invalid JSON`;
      }
      return null;
    },
  }),
  "tunnel-private-key": () => ({
    title: t`SSH private key`,
    placeholder: t`Paste the contents of your ssh private key here…`,
    type: "text",
  }),
  "tunnel-private-key-passphrase": () => ({
    title: t`Passphrase for the SSH private key`,
  }),
  "tunnel-auth-option": () => ({
    title: t`SSH authentication`,
    options: [
      { name: t`SSH Key`, value: "ssh-key" },
      { name: t`Password`, value: "password" },
    ],
  }),
  "ssl-cert": () => ({
    title: t`Server SSL certificate chain`,
    placeholder: t`Paste the contents of the server's SSL certificate chain here…`,
    type: "text",
  }),
};

function getSshDescription() {
  const link = (
    <ExternalLink
      href={MetabaseSettings.docsUrl(
        "administration-guide/ssh-tunnel-for-database-connections",
      )}
    >
      {t`Learn more`}
    </ExternalLink>
  );

  return jt`If a direct connection to your database isn't possible, you may want to use an SSH tunnel. ${link}.`;
}

function getEngineName(engine) {
  const engineInfo = ENGINES[engine];
  return engineInfo != null ? engineInfo["driver-name"] : t`Database`;
}

function getEngineInfo(engine, details, id) {
  const engineInfo = (MetabaseSettings.get("engines") || {})[engine];
  switch (engine) {
    // BigQuery has special logic to switch out forms depending on what style of authenication we use.
    case "bigquery":
      return getFieldsForBigQuery(details);
    // Mongo has special logic to switch between a connection URI and broken out fields
    case "mongo":
      return getFieldsForMongo(details, engineInfo, id);
    default:
      return engineInfo;
  }
}

function shouldShowEngineProvidedField(field, details) {
  const detailAndValueRequiredToShowField = field["visible-if"];

  if (detailAndValueRequiredToShowField) {
    const [detail, expectedDetailValue] = Object.entries(
      detailAndValueRequiredToShowField,
    )[0];

    return details[detail] === expectedDetailValue;
  }

  return true;
}

function getDefaultValue(field) {
  return "default" in field ? field.default : null;
}

function normalizeFieldValue(value, field) {
  if (value === "" || value == null) {
    return getDefaultValue(field);
  }

  if (typeof value === "string" && field.type !== "password") {
    const trimmedValue = value.trim();
    return trimmedValue === "" ? getDefaultValue(field) : trimmedValue;
  }

  return value;
}

function getEngineFormFields(engine, details, id) {
  const engineInfo = getEngineInfo(engine, details, id);
  const engineFields = engineInfo ? engineInfo["details-fields"] : [];

  // convert database details-fields to Form fields
  return engineFields
    .filter(field => shouldShowEngineProvidedField(field, details))
    .map(field => {
      const overrides = DATABASE_DETAIL_OVERRIDES[field.name];

      return {
        name: `details.${field.name}`,
        title: field["display-name"],
        type: field.type,
        description: field.description,
        placeholder: field.placeholder || field.default,
        options: field.options,
        validate: value => (field.required && !value ? t`required` : null),
        normalize: value => normalizeFieldValue(value, field),
        horizontal: field.type === "boolean",
        initial: field.default,
        readOnly: field.readOnly || false,
        helperText: field["helper-text"],
        ...(overrides && overrides(engine, details, id)),
      };
    });
}

const ENGINES = MetabaseSettings.get("engines", {});
const ELEVATED_ENGINES = getElevatedEngines();

const ENGINE_OPTIONS = Object.entries(ENGINES)
  .map(([engine, info]) => ({
    value: engine,
    name: info["driver-name"],
    official: info["official"] ?? true, // TODO remove default
    index: ELEVATED_ENGINES.indexOf(engine),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

// use top level constant for engines so we only need to compute these maps once
const ENGINE_SUPERSEDES_MAPS = Object.keys(ENGINES).reduce(
  (acc, engine) => {
    const newEngine = ENGINES[engine]["superseded-by"];
    if (newEngine) {
      acc.supersedes[newEngine] = engine;
      acc.superseded_by[engine] = newEngine;
    }
    return acc;
  },
  { supersedes: {}, superseded_by: {} },
);

/**
 * Returns the options to show in the engines selection widget. An engine is available to be selected if either
 *  - it is not superseded by any other engine
 *  - it is the selected engine (i.e. someone is already using it)
 *  - it is superseded by some engine, which happens to be the currently selected one
 *
 * The idea behind this behavior is to only show someone a "legacy" driver if they have at least selected the one that
 * will replace it first, at which point they can "fall back" on the legacy one if needed.
 *
 * @param currentEngine the current (selected engine)
 * @returns the filtered engine options to be shown in the selection widget
 */
function getEngineOptions(currentEngine) {
  return ENGINE_OPTIONS.filter(engine => {
    const engineName = engine.value;
    const newDriver = ENGINE_SUPERSEDES_MAPS["superseded_by"][engineName];
    return (
      typeof newDriver === "undefined" ||
      newDriver === currentEngine ||
      engineName === currentEngine
    );
  });
}

function getDatabaseCachingField() {
  const hasField =
    PLUGIN_CACHING.databaseCacheTTLFormField &&
    MetabaseSettings.get("enable-query-caching");
  return hasField ? PLUGIN_CACHING.databaseCacheTTLFormField : null;
}

const forms = {
  details: {
    fields: ({ id, engine, details = {} } = {}) =>
      [
        {
          name: "engine",
          title: t`Database type`,
          type: "select",
          options: getEngineOptions(engine),
          placeholder: t`Select a database`,
          isHosted: MetabaseSettings.isHosted(),
        },
        {
          name: "name",
          title: t`Display name`,
          placeholder: t`Our ${getEngineName(engine)}`,
          validate: value => !value && t`required`,
          hidden: !engine,
          helperText: t`Choose what this data will be called in Metabase.`,
        },
        ...(getEngineFormFields(engine, details, id) || []),
        {
          name: "auto_run_queries",
          type: "boolean",
          title: t`Rerun queries for simple explorations`,
          description: t`We execute the underlying query when you explore data using Summarize or Filter. This is on by default but you can turn it off if performance is slow.`,
          hidden: !engine,
        },
        {
          name: "details.let-user-control-scheduling",
          type: "boolean",
          title: t`Choose when syncs and scans happen`,
          description: t`By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.`,
          hidden: !engine,
        },
        {
          name: "refingerprint",
          type: "boolean",
          title: t`Periodically refingerprint tables`,
          description: t`This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.`,
          hidden: !engine,
        },
        getDatabaseCachingField(),
        { name: "is_full_sync", type: "hidden" },
        { name: "is_on_demand", type: "hidden" },
        {
          name: "schedules.metadata_sync",
          type: MetadataSyncScheduleWidget,
          title: t`Database syncing`,
          description: t`This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.`,
          hidden: !engine || !details["let-user-control-scheduling"],
        },
        {
          name: "schedules.cache_field_values",
          type: CacheFieldValuesScheduleWidget,
          title: t`Scanning for Filter Values`,
          description:
            t`Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database.` +
            " " +
            t`When should Metabase automatically scan and cache field values?`,
          hidden: !engine || !details["let-user-control-scheduling"],
        },
        {
          name: "cloud.firewall_connection",
          type: "empty",
          title: t`Connecting from behind a firewall`,
          description: t`In order to make sure Metabase can access your database,
              configure your firewall to allow connections from these IP addresses:
              ${MetabaseSettings.cloudGatewayIps().join(", ")}.`,
          hidden:
            !engine ||
            !getEngineSupportsFirewall(engine) ||
            !MetabaseSettings.isHosted() ||
            !MetabaseSettings.cloudGatewayIps().length,
        },
      ].filter(Boolean),
    normalize: function(database) {
      if (!database.details["let-user-control-scheduling"]) {
        // TODO Atte Keinänen 8/15/17: Implement engine-specific scheduling defaults
        return {
          ...database,
          is_full_sync: true,
        };
      } else {
        return database;
      }
    },
  },
};

forms.setup = {
  ...forms.details,
  fields: (...args) =>
    forms.details.fields(...args).map(field => ({
      ...field,
      type: field.name === "engine" ? EngineWidget : field.type,
      title: field.name === "engine" ? null : field.title,
      hidden: field.hidden || ADVANCED_FIELDS.has(field.name),
    })),
};

// partial forms for tabbed view:
forms.connection = {
  ...forms.details,
  fields: (...args) =>
    forms.details.fields(...args).map(field => ({
      ...field,
      hidden: field.hidden || SCHEDULING_FIELDS.has(field.name),
    })),
};
forms.scheduling = {
  ...forms.details,
  fields: (...args) =>
    forms.details.fields(...args).map(field => ({
      ...field,
      hidden: field.hidden || !SCHEDULING_FIELDS.has(field.name),
    })),
};

const SCHEDULING_FIELDS = new Set([
  "schedules.metadata_sync",
  "schedules.cache_field_values",
]);

const ADVANCED_FIELDS = new Set([
  "auto_run_queries",
  "details.let-user-control-scheduling",
  ...SCHEDULING_FIELDS,
]);

export default forms;
export const engineSupersedesMap = ENGINE_SUPERSEDES_MAPS;
export const allEngines = ENGINES;
