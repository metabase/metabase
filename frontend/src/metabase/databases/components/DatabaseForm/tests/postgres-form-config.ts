import type { Engine } from "metabase-types/api";

export const postgresFormConfig = {
  source: {
    type: "official",
    contact: null,
  },
  "details-fields": [
    {
      name: "host",
      "display-name": "Host",
      "helper-text":
        "Your database's IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
      placeholder: "name.database.com",
    },
    {
      name: "port",
      "display-name": "Port",
      type: "integer",
      placeholder: 5432,
    },
    {
      name: "dbname",
      "display-name": "Database name",
      placeholder: "birds_of_the_world",
      required: true,
    },
    {
      name: "user",
      "display-name": "Username",
      placeholder: "username",
      required: true,
    },
    {
      name: "auth-provider",
      "display-name": "Auth provider",
      type: "select",
      options: [
        {
          name: "Azure Managed Identity",
          value: "azure-managed-identity",
        },
        {
          name: "OAuth",
          value: "oauth",
        },
      ],
      default: "azure-managed-identity",
      "visible-if": {
        "use-auth-provider": true,
      },
    },
    {
      name: "azure-managed-identity-client-id",
      "display-name": "Client ID",
      required: true,
      "visible-if": {
        "auth-provider": "azure-managed-identity",
        "use-auth-provider": true,
      },
    },
    {
      name: "oauth-token-url",
      "display-name": "Auth token URL",
      required: true,
      "visible-if": {
        "auth-provider": "oauth",
        "use-auth-provider": true,
      },
    },
    {
      name: "oauth-token-headers",
      "display-name": "Auth token request headers (a JSON map)",
      "visible-if": {
        "auth-provider": "oauth",
        "use-auth-provider": true,
      },
    },
    {
      name: "password",
      "display-name": "Password",
      type: "password",
      placeholder: "••••••••",
    },
    {
      name: "schema-filters-type",
      "display-name": "Schemas",
      type: "select",
      options: [
        {
          name: "All",
          value: "all",
        },
        {
          name: "Only these...",
          value: "inclusion",
        },
        {
          name: "All except...",
          value: "exclusion",
        },
      ],
      default: "all",
      "visible-if": {
        "destination-database": false,
      },
    },
    {
      name: "schema-filters-patterns",
      type: "text",
      placeholder: "E.x. public,auth*",
      description:
        "Comma separated names of schemas that should appear in Metabase",
      "visible-if": {
        "schema-filters-type": "inclusion",
        "destination-database": false,
      },
      "helper-text":
        'You can use patterns like "auth*" to match multiple schemas',
      required: true,
    },
    {
      name: "schema-filters-patterns",
      type: "text",
      placeholder: "E.x. public,auth*",
      description:
        "Comma separated names of schemas that should NOT appear in Metabase",
      "visible-if": {
        "schema-filters-type": "exclusion",
        "destination-database": false,
      },
      "helper-text":
        'You can use patterns like "auth*" to match multiple schemas',
      required: true,
    },
    {
      name: "ssl",
      "display-name": "Use a secure connection (SSL)",
      type: "boolean",
      default: false,
    },
    {
      name: "ssl-mode",
      "display-name": "SSL Mode",
      type: "select",
      options: [
        {
          name: "allow",
          value: "allow",
        },
        {
          name: "prefer",
          value: "prefer",
        },
        {
          name: "require",
          value: "require",
        },
        {
          name: "verify-ca",
          value: "verify-ca",
        },
        {
          name: "verify-full",
          value: "verify-full",
        },
      ],
      default: "require",
      "visible-if": {
        ssl: true,
      },
    },
    {
      name: "ssl-root-cert-options",
      "display-name": "SSL Root Certificate (PEM)",
      type: "select",
      options: [
        {
          name: "Local file path",
          value: "local",
        },
        {
          name: "Uploaded file path",
          value: "uploaded",
        },
      ],
      default: "local",
      "visible-if": {
        "ssl-mode": ["verify-ca", "verify-full"],
        ssl: true,
      },
    },
    {
      name: "ssl-root-cert-value",
      type: "textFile",
      "treat-before-posting": "base64",
      "visible-if": {
        "ssl-root-cert-options": "uploaded",
        "ssl-mode": ["verify-ca", "verify-full"],
        ssl: true,
      },
    },
    {
      name: "ssl-root-cert-path",
      type: "string",
      "display-name": "File path",
      placeholder: null,
      "visible-if": {
        "ssl-root-cert-options": "local",
        "ssl-mode": ["verify-ca", "verify-full"],
        ssl: true,
      },
    },
    {
      name: "ssl-use-client-auth",
      "display-name": "Authenticate client certificate?",
      type: "boolean",
      "visible-if": {
        ssl: true,
      },
    },
    {
      name: "ssl-client-cert-options",
      "display-name": "SSL Client Certificate (PEM)",
      type: "select",
      options: [
        {
          name: "Local file path",
          value: "local",
        },
        {
          name: "Uploaded file path",
          value: "uploaded",
        },
      ],
      default: "local",
      "visible-if": {
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "ssl-client-cert-value",
      type: "textFile",
      "treat-before-posting": "base64",
      "visible-if": {
        "ssl-client-cert-options": "uploaded",
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "ssl-client-cert-path",
      type: "string",
      "display-name": "File path",
      placeholder: null,
      "visible-if": {
        "ssl-client-cert-options": "local",
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "ssl-key-options",
      "display-name": "SSL Client Key (PKCS-8/DER)",
      type: "select",
      options: [
        {
          name: "Local file path",
          value: "local",
        },
        {
          name: "Uploaded file path",
          value: "uploaded",
        },
      ],
      default: "local",
      "visible-if": {
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "ssl-key-value",
      type: "textFile",
      "treat-before-posting": "base64",
      "visible-if": {
        "ssl-key-options": "uploaded",
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "ssl-key-path",
      type: "string",
      "display-name": "File path",
      placeholder: null,
      "visible-if": {
        "ssl-key-options": "local",
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "ssl-key-password-value",
      "display-name": "SSL Client Key Password",
      type: "password",
      "visible-if": {
        "ssl-use-client-auth": true,
        ssl: true,
      },
    },
    {
      name: "tunnel-enabled",
      "display-name": "Use an SSH tunnel",
      placeholder: "Enable this SSH tunnel?",
      type: "boolean",
      default: false,
    },
    {
      name: "tunnel-host",
      "display-name": "SSH tunnel host",
      "helper-text": "The hostname that you use to connect to SSH tunnels.",
      placeholder: "hostname",
      required: true,
      "visible-if": {
        "tunnel-enabled": true,
      },
    },
    {
      name: "tunnel-port",
      "display-name": "SSH tunnel port",
      type: "integer",
      default: 22,
      required: false,
      "visible-if": {
        "tunnel-enabled": true,
      },
    },
    {
      name: "tunnel-user",
      "display-name": "SSH tunnel username",
      "helper-text": "The username you use to login to your SSH tunnel.",
      placeholder: "username",
      required: true,
      "visible-if": {
        "tunnel-enabled": true,
      },
    },
    {
      name: "tunnel-auth-option",
      "display-name": "SSH Authentication",
      type: "select",
      options: [
        {
          name: "SSH Key",
          value: "ssh-key",
        },
        {
          name: "Password",
          value: "password",
        },
      ],
      default: "ssh-key",
      "visible-if": {
        "tunnel-enabled": true,
      },
    },
    {
      name: "tunnel-pass",
      "display-name": "SSH tunnel password",
      type: "password",
      placeholder: "******",
      "visible-if": {
        "tunnel-auth-option": "password",
        "tunnel-enabled": true,
      },
    },
    {
      name: "tunnel-private-key",
      "display-name": "SSH private key to connect to the tunnel",
      type: "string",
      placeholder: "Paste the contents of an SSH private key here",
      required: true,
      "visible-if": {
        "tunnel-auth-option": "ssh-key",
        "tunnel-enabled": true,
      },
    },
    {
      name: "tunnel-private-key-passphrase",
      "display-name": "Passphrase for SSH private key",
      type: "password",
      placeholder: "******",
      "visible-if": {
        "tunnel-auth-option": "ssh-key",
        "tunnel-enabled": true,
      },
    },
    {
      name: "advanced-options",
      type: "section",
      default: false,
      "visible-if": {
        "destination-database": false,
      },
    },
    {
      name: "json-unfolding",
      "display-name": "Allow unfolding of JSON columns",
      type: "boolean",
      "visible-if": {
        "advanced-options": true,
        "destination-database": false,
      },
      description:
        "This enables unfolding JSON columns into their component fields. Disable unfolding if performance is slow. If enabled, you can still disable unfolding for individual fields in their settings.",
      default: true,
    },
    {
      name: "additional-options",
      "display-name": "Additional JDBC connection string options",
      "visible-if": {
        "advanced-options": true,
        "destination-database": false,
      },
      placeholder: "prepareThreshold=0",
    },
    {
      name: "destination-database",
      type: "hidden",
      default: false,
    },
    {
      name: "auto_run_queries",
      type: "boolean",
      default: true,
      "display-name": "Rerun queries for simple explorations",
      description:
        "We execute the underlying query when you explore data using Summarize or Filter. This is on by default but you can turn it off if performance is slow.",
      "visible-if": {
        "advanced-options": true,
        "destination-database": false,
      },
    },
    {
      name: "let-user-control-scheduling",
      type: "boolean",
      "display-name": "Choose when syncs and scans happen",
      description:
        "By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.",
      "visible-if": {
        "advanced-options": true,
        "destination-database": false,
      },
    },
    {
      name: "schedules.metadata_sync",
      "display-name": "Database syncing",
      description:
        "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
      "visible-if": {
        "let-user-control-scheduling": true,
        "advanced-options": true,
        "destination-database": false,
      },
    },
    {
      name: "schedules.cache_field_values",
      "display-name": "Scanning for Filter Values",
      description:
        "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
      "visible-if": {
        "let-user-control-scheduling": true,
        "advanced-options": true,
        "destination-database": false,
      },
    },
    {
      name: "refingerprint",
      type: "boolean",
      "display-name": "Periodically refingerprint tables",
      description:
        "This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.",
      "visible-if": {
        "advanced-options": true,
        "destination-database": false,
      },
    },
  ],
  "driver-name": "PostgreSQL",
  "superseded-by": null,
  "extra-info": null,
} satisfies Engine;
