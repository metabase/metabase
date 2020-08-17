import React from "react";
import { t, jt } from "ttag";

import MetabaseSettings from "metabase/lib/settings";
import ExternalLink from "metabase/components/ExternalLink";
import getFieldsForBigQuery from "./big-query-fields";
import getFieldsForMongo from "./mongo-fields";

import MetadataSyncScheduleWidget from "metabase/admin/databases/components/widgets/MetadataSyncScheduleWidget";
import CacheFieldValuesScheduleWidget from "metabase/admin/databases/components/widgets/CacheFieldValuesScheduleWidget";

const DATABASE_DETAIL_OVERRIDES = {
  "tunnel-enabled": (engine, details) => ({
    title: t`Use an SSH-tunnel for database connections`,
    description: t`Some database installations can only be accessed by connecting through an SSH bastion host. This option also provides an extra layer of security when a VPN is not available. Enabling this is usually slower than a direct connection.`,
  }),
  "use-jvm-timezone": (engine, details) => ({
    title: t`Use the Java Virtual Machine (JVM) timezone`,
    description: t`We suggest you leave this off unless you're doing manual timezone casting in many or most of your queries with this data.`,
  }),
  "use-srv": (engine, details) => ({
    title: t`Use DNS SRV when connecting`,
    description: t`Using this option requires that provided host is a FQDN.  If connecting to an Atlas cluster, you might need to enable this option.  If you don't know what this means, leave this disabled.`,
  }),
  "client-id": (engine, details) => ({
    description: getClientIdDescription(engine, details),
  }),
  "auth-code": (engine, details) => ({
    description: (
      <div>
        <div>{getAuthCodeLink(engine, details)}</div>
        <div>{getAuthCodeEnableAPILink(engine, details)}</div>
      </div>
    ),
  }),
  "service-account-json": (engine, details) => ({
    validate: value => {
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
  "tunnel-private-key": (engine, details) => ({
    title: t`SSH private key`,
    placeholder: t`Paste the contents of your ssh private key here`,
    type: "text",
  }),
  "tunnel-private-key-passphrase": (engine, details) => ({
    title: t`Passphrase for the SSH private key`,
  }),
  "tunnel-auth-option": (engine, details) => ({
    title: t`SSH Authentication`,
    options: [
      { name: t`SSH Key`, value: "ssh-key" },
      { name: t`Password`, value: "password" },
    ],
  }),
  "ssl-cert": (engine, details) => ({
    title: t`Server SSL certificate chain`,
    placeholder: t`Paste the contents of the server's SSL certificate chain here`,
    type: "text",
  }),
};

const AUTH_URL_PREFIXES = {
  bigquery:
    "https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery&client_id=",
  bigquery_with_drive:
    "https://accounts.google.com/o/oauth2/auth?redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/bigquery%20https://www.googleapis.com/auth/drive&client_id=",
  googleanalytics:
    "https://accounts.google.com/o/oauth2/auth?access_type=offline&redirect_uri=urn:ietf:wg:oauth:2.0:oob&response_type=code&scope=https://www.googleapis.com/auth/analytics.readonly&client_id=",
};

const ENABLE_API_PREFIXES = {
  googleanalytics:
    "https://console.developers.google.com/apis/api/analytics.googleapis.com/overview?project=",
};

const CREDENTIALS_URL_PREFIXES = {
  bigquery:
    "https://console.developers.google.com/apis/credentials/oauthclient?project=",
  googleanalytics:
    "https://console.developers.google.com/apis/credentials/oauthclient?project=",
};

export const DEFAULT_SCHEDULES = {
  cache_field_values: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: 0,
    schedule_type: "daily",
  },
  metadata_sync: {
    schedule_day: null,
    schedule_frame: null,
    schedule_hour: null,
    schedule_type: "hourly",
  },
};

function getClientIdDescription(engine, details) {
  if (CREDENTIALS_URL_PREFIXES[engine]) {
    const credentialsURL =
      CREDENTIALS_URL_PREFIXES[engine] + (details["project-id"] || "");
    return (
      <span>
        {jt`${(
          <ExternalLink className="link" href={credentialsURL}>
            {t`Click here`}
          </ExternalLink>
        )} to generate a Client ID and Client Secret for your project.`}{" "}
        {t`Choose "Other" as the application type. Name it whatever you'd like.`}
      </span>
    );
  }
}

function getAuthCodeLink(engine, details) {
  if (AUTH_URL_PREFIXES[engine] && details["client-id"]) {
    return (
      <span>
        {jt`${(
          <ExternalLink href={AUTH_URL_PREFIXES[engine] + details["client-id"]}>
            {t`Click here`}
          </ExternalLink>
        )} to get an auth code.`}
        {engine === "bigquery" && (
          <span>
            {" "}
            ({t`or`}{" "}
            <ExternalLink
              href={
                AUTH_URL_PREFIXES["bigquery_with_drive"] + details["client-id"]
              }
            >
              {t`with Google Drive permissions`}
            </ExternalLink>
            )
          </span>
        )}
      </span>
    );
  }
}
function getAuthCodeEnableAPILink(engine, details) {
  // for Google Analytics we need to show a link for people to go to the Console to enable the GA API
  if (AUTH_URL_PREFIXES[engine] && details["client-id"]) {
    // projectID is just the first numeric part of the client-id.
    // e.g. client-id might be 123436115855-q8z42hilmjf8iplnnu49n7jbudmxxdf.apps.googleusercontent.com
    // then project-id would be 123436115855
    const projectID =
      details["client-id"] && (details["client-id"].match(/^\d+/) || [])[0];
    if (ENABLE_API_PREFIXES[engine] && projectID) {
      // URL looks like https://console.developers.google.com/apis/api/analytics.googleapis.com/overview?project=12343611585
      const enableAPIURL = ENABLE_API_PREFIXES[engine] + projectID;
      return (
        <span>
          {t`To use Metabase with this data you must enable API access in the Google Developers Console.`}{" "}
          {jt`${(
            <ExternalLink href={enableAPIURL}>{t`Click here`}</ExternalLink>
          )} to go to the console if you haven't already done so.`}
        </span>
      );
    }
  }
}

function getFieldsForEngine(engine, details, id) {
  let info = (MetabaseSettings.get("engines") || {})[engine];
  if (engine === "bigquery") {
    // BigQuery has special logic to switch out forms depending on what style of authenication we use.
    info = getFieldsForBigQuery(details);
  }
  if (engine === "mongo") {
    // Mongo has special logic to switch between a connection URI and broken out fields
    info = getFieldsForMongo(details, info, id);
  }
  if (info) {
    const fields = [];
    for (const field of info["details-fields"]) {
      // NOTE: special case to hide tunnel settings if tunnel is disabled
      if (
        field.name.startsWith("tunnel-") &&
        field.name !== "tunnel-enabled" &&
        !details["tunnel-enabled"]
      ) {
        continue;
      }

      // hide the auth settings based on which auth method is selected
      // private key auth needs tunnel-private-key and tunnel-private-key-passphrase
      if (
        field.name.startsWith("tunnel-private-") &&
        details["tunnel-auth-option"] !== "ssh-key"
      ) {
        continue;
      }

      // username / password auth uses tunnel-pass
      if (
        field.name === "tunnel-pass" &&
        details["tunnel-auth-option"] === "ssh-key"
      ) {
        continue;
      }

      // NOTE: special case to hide the SSL cert field if SSL is disabled
      if (field.name === "ssl-cert" && !details["ssl"]) {
        continue;
      }

      const overrides = DATABASE_DETAIL_OVERRIDES[field.name];
      // convert database details-fields to Form fields
      fields.push({
        name: `details.${field.name}`,
        title: field["display-name"],
        type: field.type,
        description: field.description,
        placeholder: field.placeholder || field.default,
        options: field.options,
        validate: value => (field.required && !value ? t`required` : null),
        normalize: value =>
          value === "" || value == null
            ? "default" in field
              ? field.default
              : null
            : value,
        horizontal: field.type === "boolean",
        initial: field.default,
        readOnly: field.readOnly || false,
        ...(overrides && overrides(engine, details)),
      });
    }
    return fields;
  } else {
    return [];
  }
}

const ENGINE_OPTIONS = Object.entries(MetabaseSettings.get("engines") || {})
  .map(([engine, info]) => ({
    name: info["driver-name"],
    value: engine,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const forms = {
  details: {
    fields: ({ id, engine, details = {} } = {}) => [
      {
        name: "engine",
        title: t`Database type`,
        type: "select",
        options: ENGINE_OPTIONS,
        placeholder: t`Select a database`,
      },
      {
        name: "name",
        title: t`Name`,
        placeholder: t`How would you like to refer to this database?`,
        validate: value => !value && t`required`,
        hidden: !engine,
      },
      ...(getFieldsForEngine(engine, details, id) || []),
      {
        name: "auto_run_queries",
        type: "boolean",
        title: t`Automatically run queries when doing simple filtering and summarizing`,
        description: t`When this is on, Metabase will automatically run queries when users do simple explorations with the Summarize and Filter buttons when viewing a table or chart. You can turn this off if querying this database is slow. This setting doesn’t affect drill-throughs or SQL queries.`,
        initial: true,
        hidden: !engine,
      },
      {
        name: "details.let-user-control-scheduling",
        type: "boolean",
        title: t`This is a large database, so let me choose when Metabase syncs and scans`,
        description: t`By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, we recommend turning this on and reviewing when and how often the field value scans happen.`,
        hidden: !engine,
      },
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
    ],
    normalize: function(database) {
      if (!database.details["let-user-control-scheduling"]) {
        // If we don't let user control the scheduling settings, let's override them with Metabase defaults
        // TODO Atte Keinänen 8/15/17: Implement engine-specific scheduling defaults
        return {
          ...database,
          is_full_sync: true,
          schedules: DEFAULT_SCHEDULES,
        };
      } else {
        return database;
      }
    },
  },
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

export default forms;
