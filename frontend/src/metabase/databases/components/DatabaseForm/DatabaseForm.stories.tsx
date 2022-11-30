import React from "react";
import type { ComponentStory } from "@storybook/react";
import { createMockEngine } from "metabase-types/api/mocks";
import DatabaseForm from "./DatabaseForm";

export default {
  title: "Databases/DatabaseForm",
  component: DatabaseForm,
};

const Template: ComponentStory<typeof DatabaseForm> = args => {
  return <DatabaseForm {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  engines: {
    postgres: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
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
        },
        {
          name: "schema-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of schemas that <strong>should</strong> appear in Metabase",
          "visible-if": {
            "schema-filters-type": "inclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple schemas",
          required: true,
        },
        {
          name: "schema-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of schemas that <strong>should NOT</strong> appear in Metabase",
          "visible-if": {
            "schema-filters-type": "exclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple schemas",
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
            ssl: true,
            "ssl-mode": ["verify-ca", "verify-full"],
          },
        },
        {
          name: "ssl-root-cert-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            ssl: true,
            "ssl-mode": ["verify-ca", "verify-full"],
            "ssl-root-cert-options": "uploaded",
          },
        },
        {
          name: "ssl-root-cert-path",
          type: "string",
          "display-name": "File path",
          placeholder: null,
          "visible-if": {
            ssl: true,
            "ssl-mode": ["verify-ca", "verify-full"],
            "ssl-root-cert-options": "local",
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
            ssl: true,
            "ssl-use-client-auth": true,
          },
        },
        {
          name: "ssl-client-cert-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            ssl: true,
            "ssl-use-client-auth": true,
            "ssl-client-cert-options": "uploaded",
          },
        },
        {
          name: "ssl-client-cert-path",
          type: "string",
          "display-name": "File path",
          placeholder: null,
          "visible-if": {
            ssl: true,
            "ssl-use-client-auth": true,
            "ssl-client-cert-options": "local",
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
            ssl: true,
            "ssl-use-client-auth": true,
          },
        },
        {
          name: "ssl-key-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            ssl: true,
            "ssl-use-client-auth": true,
            "ssl-key-options": "uploaded",
          },
        },
        {
          name: "ssl-key-path",
          type: "string",
          "display-name": "File path",
          placeholder: null,
          "visible-if": {
            ssl: true,
            "ssl-use-client-auth": true,
            "ssl-key-options": "local",
          },
        },
        {
          name: "ssl-key-password-value",
          "display-name": "SSL Client Key Password",
          type: "password",
          "visible-if": {
            ssl: true,
            "ssl-use-client-auth": true,
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "json-unfolding",
          "display-name": "Unfold JSON Columns",
          type: "boolean",
          "visible-if": {
            "advanced-options": true,
          },
          description:
            "We unfold JSON columns into component fields.This is on by default but you can turn it off if performance is slow.",
          default: true,
        },
        {
          name: "additional-options",
          "display-name": "Additional JDBC connection string options",
          "visible-if": {
            "advanced-options": true,
          },
          placeholder: "prepareThreshold=0",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "PostgreSQL",
      "superseded-by": null,
    },
    googleanalytics: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "account-id",
          "display-name": "Google Analytics Account ID",
          "helper-text":
            "You can find the Account ID in Google Analytics → Admin → Account Settings.",
          placeholder: "1234567",
          required: true,
        },
        {
          name: "service-account-json",
          "display-name": "Service account JSON file",
          "helper-text":
            "This JSON file contains the credentials Metabase needs to read and query your dataset.",
          required: true,
          type: "textFile",
        },
        {
          name: "advanced-options",
          type: "section",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Google Analytics",
      "superseded-by": null,
    },
    sparksql: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          default: 10000,
        },
        {
          name: "dbname",
          "display-name": "Database name",
          placeholder: "default",
          required: true,
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: true,
        },
        {
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "jdbc-flags",
          "display-name": "Additional JDBC connection string options",
          "visible-if": {
            "advanced-options": true,
          },
          placeholder: ";transportMode=http",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Spark SQL",
      "superseded-by": null,
    },
    mongo: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "use-conn-uri",
          type: "section",
          default: false,
        },
        {
          name: "conn-uri",
          type: "string",
          "display-name": "Paste your connection string",
          placeholder:
            "mongodb://[username:password@]host1[:port1][,...hostN[:portN]][/[dbname][?options]]",
          required: true,
          "visible-if": {
            "use-conn-uri": true,
          },
        },
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "dbname",
          "display-name": "Database name",
          placeholder: "birds_of_the_world",
          required: true,
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          default: 27017,
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: false,
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "pass",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "authdb",
          "display-name": "Authentication database (optional)",
          placeholder: "admin",
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "ssl",
          "display-name": "Use a secure connection (SSL)",
          type: "boolean",
          default: false,
          "visible-if": {
            "use-conn-uri": false,
          },
        },
        {
          name: "ssl-cert",
          type: "string",
          "display-name": "Server SSL certificate chain (PEM)",
          "visible-if": {
            "use-conn-uri": false,
            ssl: true,
          },
        },
        {
          name: "ssl-use-client-auth",
          "display-name": "Authenticate client certificate?",
          type: "boolean",
          "visible-if": {
            "use-conn-uri": false,
            ssl: true,
          },
        },
        {
          name: "client-ssl-cert",
          "display-name": "Client SSL certificate chain (PEM)",
          placeholder:
            "Paste the contents of the client's SSL certificate chain here",
          type: "text",
          "visible-if": {
            "use-conn-uri": false,
            ssl: true,
            "ssl-use-client-auth": true,
          },
        },
        {
          name: "client-ssl-key-options",
          "display-name": "Client SSL private key (PEM)",
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
            "use-conn-uri": false,
            ssl: true,
            "ssl-use-client-auth": true,
          },
        },
        {
          name: "client-ssl-key-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            "use-conn-uri": false,
            ssl: true,
            "ssl-use-client-auth": true,
            "client-ssl-key-options": "uploaded",
          },
        },
        {
          name: "client-ssl-key-path",
          type: "string",
          "display-name": "File path",
          placeholder: null,
          "visible-if": {
            "use-conn-uri": false,
            ssl: true,
            "ssl-use-client-auth": true,
            "client-ssl-key-options": "local",
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "additional-options",
          "display-name": "Additional connection string options (optional)",
          "visible-if": {
            "use-conn-uri": false,
          },
          placeholder:
            "retryWrites=true&w=majority&authSource=admin&readPreference=nearest&replicaSet=test",
        },
        {
          name: "use-srv",
          type: "boolean",
          default: false,
          "visible-if": {
            "use-conn-uri": false,
            "advanced-options": true,
          },
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "MongoDB",
      "superseded-by": null,
    },
    druid: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
          default: "http://localhost",
        },
        {
          name: "port",
          "display-name": "Broker node port",
          type: "integer",
          default: 8082,
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Druid",
      "superseded-by": null,
    },
    redshift: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder:
            "my-cluster-name.abcd1234.us-east-1.redshift.amazonaws.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          default: 5439,
        },
        {
          name: "db",
          "display-name": "Database name",
          placeholder: "birds_of_the_world",
          required: true,
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
        },
        {
          name: "schema-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of schemas that <strong>should</strong> appear in Metabase",
          "visible-if": {
            "schema-filters-type": "inclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple schemas",
          required: true,
        },
        {
          name: "schema-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of schemas that <strong>should NOT</strong> appear in Metabase",
          "visible-if": {
            "schema-filters-type": "exclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple schemas",
          required: true,
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: true,
        },
        {
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "additional-options",
          "display-name": "Additional JDBC connection string options",
          "visible-if": {
            "advanced-options": true,
          },
          placeholder: "SocketTimeout=0",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Amazon Redshift",
      "superseded-by": null,
    },
    "bigquery-cloud-sdk": {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "project-id",
          "display-name": "Project ID (override)",
          "helper-text":
            "Project ID to be used for authentication. You can omit this field if you are only querying datasets owned by your organization.",
          required: false,
          placeholder: "1w08oDRKPrOqBt06yxY8uiCz2sSvOp3u",
        },
        {
          name: "service-account-json",
          "display-name": "Service account JSON file",
          "helper-text":
            "This JSON file contains the credentials Metabase needs to read and query your dataset.",
          required: true,
          type: "textFile",
        },
        {
          name: "dataset-filters-type",
          "display-name": "Datasets",
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
        },
        {
          name: "dataset-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of datasets that <strong>should</strong> appear in Metabase",
          "visible-if": {
            "dataset-filters-type": "inclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple datasets",
          required: true,
        },
        {
          name: "dataset-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of datasets that <strong>should NOT</strong> appear in Metabase",
          "visible-if": {
            "dataset-filters-type": "exclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple datasets",
          required: true,
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "use-jvm-timezone",
          "display-name": "Use JVM Time Zone",
          default: false,
          type: "boolean",
          "visible-if": {
            "advanced-options": true,
          },
        },
        {
          name: "include-user-id-and-hash",
          "display-name": "Include User ID and query hash in queries",
          default: true,
          type: "boolean",
          "visible-if": {
            "advanced-options": true,
          },
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "BigQuery",
      "superseded-by": null,
    },
    snowflake: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "account",
          "display-name": "Account name",
          "helper-text":
            'Enter your Account ID with the region that your Snowflake cluster is running on e.g. "xxxxxxxx.us-east-2.aws". Some regions don\'t have this suffix.',
          placeholder: "xxxxxxxx.us-east-2.aws",
          required: true,
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: true,
        },
        {
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
        },
        {
          name: "private-key-options",
          "display-name": "RSA private key (PEM)",
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
        },
        {
          name: "private-key-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            "private-key-options": "uploaded",
          },
        },
        {
          name: "private-key-path",
          type: "string",
          "display-name": "File path",
          placeholder: null,
          "visible-if": {
            "private-key-options": "local",
          },
        },
        {
          name: "warehouse",
          "display-name": "Warehouse",
          "helper-text":
            "If your user doesn't have a default warehouse, enter the warehouse to connect to.",
          placeholder: "birds_main",
          required: true,
        },
        {
          name: "db",
          "display-name": "Database name (case sensitive)",
          placeholder: "birds_of_the_world",
          required: true,
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
        },
        {
          name: "schema-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of schemas that <strong>should</strong> appear in Metabase",
          "visible-if": {
            "schema-filters-type": "inclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple schemas",
          required: true,
        },
        {
          name: "schema-filters-patterns",
          type: "text",
          placeholder: "E.x. public,auth*",
          description:
            "Comma separated names of schemas that <strong>should NOT</strong> appear in Metabase",
          "visible-if": {
            "schema-filters-type": "exclusion",
          },
          "helper-text":
            "You can use patterns like <strong>auth*</strong> to match multiple schemas",
          required: true,
        },
        {
          name: "role",
          "display-name": "Role (optional)",
          "helper-text":
            "Specify a role to override the database user’s default role.",
          placeholder: "user",
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "additional-options",
          "display-name": "Additional JDBC connection string options",
          "visible-if": {
            "advanced-options": true,
          },
          placeholder: "queryTimeout=0",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Snowflake",
      "superseded-by": null,
    },
    "presto-jdbc": {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          default: 8080,
        },
        {
          name: "catalog",
          "display-name": "Catalog",
          placeholder: "european_birds",
          required: false,
          "helper-text":
            "Presto Catalogs contain schemas and reference data sources via a connector.",
        },
        {
          name: "schema",
          "display-name": "Schema (optional)",
          "helper-text":
            "Only add tables to Metabase that come from a specific schema.",
          placeholder: "just_crows",
          required: false,
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: false,
        },
        {
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
          required: false,
        },
        {
          name: "ssl",
          "display-name": "Use a secure connection (SSL)",
          type: "boolean",
          default: false,
        },
        {
          name: "ssl-use-keystore",
          "display-name": "Use SSL server certificate?",
          type: "boolean",
          "visible-if": {
            ssl: true,
          },
        },
        {
          name: "ssl-keystore-options",
          "display-name": "Keystore",
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
            ssl: true,
            "ssl-use-keystore": true,
          },
        },
        {
          name: "ssl-keystore-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            ssl: true,
            "ssl-use-keystore": true,
            "ssl-keystore-options": "uploaded",
          },
        },
        {
          name: "ssl-keystore-path",
          type: "string",
          "display-name": "File path",
          placeholder: "/path/to/keystore.jks",
          "visible-if": {
            ssl: true,
            "ssl-use-keystore": true,
            "ssl-keystore-options": "local",
          },
        },
        {
          name: "ssl-keystore-password-value",
          "display-name": "Keystore password",
          type: "password",
          required: false,
          "visible-if": {
            ssl: true,
            "ssl-use-keystore": true,
          },
        },
        {
          name: "ssl-use-truststore",
          "display-name": "Use SSL truststore?",
          type: "boolean",
          "visible-if": {
            ssl: true,
          },
        },
        {
          name: "ssl-truststore-options",
          "display-name": "Truststore",
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
            ssl: true,
            "ssl-use-truststore": true,
          },
        },
        {
          name: "ssl-truststore-value",
          type: "textFile",
          "treat-before-posting": "base64",
          "visible-if": {
            ssl: true,
            "ssl-use-truststore": true,
            "ssl-truststore-options": "uploaded",
          },
        },
        {
          name: "ssl-truststore-path",
          type: "string",
          "display-name": "File path",
          placeholder: "/path/to/truststore.jks",
          "visible-if": {
            ssl: true,
            "ssl-use-truststore": true,
            "ssl-truststore-options": "local",
          },
        },
        {
          name: "ssl-truststore-password-value",
          "display-name": "Truststore password",
          type: "password",
          required: false,
          "visible-if": {
            ssl: true,
            "ssl-use-truststore": true,
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "kerberos",
          type: "boolean",
          "display-name": "Authenticate with Kerberos",
          default: false,
          "visible-if": {
            "advanced-options": true,
          },
        },
        {
          name: "kerberos-principal",
          "display-name": "Kerberos principal",
          placeholder: "service/instance@REALM",
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "kerberos-remote-service-name",
          "display-name": "Kerberos coordinator service",
          placeholder: "presto",
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "kerberos-use-canonical-hostname",
          type: "boolean",
          "display-name": "Use canonical hostname",
          default: false,
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "kerberos-credential-cache-path",
          "display-name": "Kerberos credential cache file",
          placeholder: "/tmp/kerberos-credential-cache",
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "kerberos-keytab-path",
          "display-name": "Kerberos keytab file",
          placeholder: "/path/to/kerberos.keytab",
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "kerberos-config-path",
          "display-name": "Kerberos configuration file",
          placeholder: "/etc/krb5.conf",
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "kerberos-service-principal-pattern",
          "display-name":
            "Presto coordinator Kerberos service principal pattern",
          placeholder: "${SERVICE}@${HOST}. ${SERVICE}",
          required: false,
          "visible-if": {
            "advanced-options": true,
            kerberos: true,
          },
        },
        {
          name: "additional-options",
          "display-name": "Additional JDBC options",
          placeholder:
            "SSLKeyStorePath=/path/to/keystore.jks&SSLKeyStorePassword=whatever",
          required: false,
          "visible-if": {
            "advanced-options": true,
          },
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Presto",
      "superseded-by": null,
    },
    h2: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "db",
          "display-name": "Connection String",
          "helper-text":
            "The local path relative to where Metabase is running from. Your string should not include the .mv.db extension.",
          placeholder: "file:/Users/camsaul/bird_sightings/toucans",
          required: true,
        },
        {
          name: "advanced-options",
          type: "section",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "H2",
      "superseded-by": null,
    },
    sqlite: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "db",
          "display-name": "Filename",
          placeholder: "/home/camsaul/toucan_sightings.sqlite",
          required: true,
        },
        {
          name: "advanced-options",
          type: "section",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "SQLite",
      "superseded-by": null,
    },
    presto: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          default: 8080,
        },
        {
          name: "catalog",
          "display-name": "Catalog",
          placeholder: "european_birds",
          required: true,
          "helper-text":
            "Presto Catalogs contain schemas and reference data sources via a connector.",
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: true,
        },
        {
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
        },
        {
          name: "ssl",
          "display-name": "Use a secure connection (SSL)",
          type: "boolean",
          default: false,
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "Presto (Deprecated Driver)",
      "superseded-by": "presto-jdbc",
    },
    mysql: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          placeholder: 3306,
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
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
        },
        {
          name: "ssl",
          "display-name": "Use a secure connection (SSL)",
          type: "boolean",
          default: false,
        },
        {
          name: "ssl-cert",
          "display-name": "Server SSL certificate chain",
          placeholder: "",
          "visible-if": {
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "json-unfolding",
          "display-name": "Unfold JSON Columns",
          type: "boolean",
          "visible-if": {
            "advanced-options": true,
          },
          description:
            "We unfold JSON columns into component fields.This is on by default but you can turn it off if performance is slow.",
          default: true,
        },
        {
          name: "additional-options",
          "display-name": "Additional JDBC connection string options",
          "visible-if": {
            "advanced-options": true,
          },
          placeholder: "tinyInt1isBit=false",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "MySQL",
      "superseded-by": null,
    },
    sqlserver: {
      source: {
        type: "official",
        contact: null,
      },
      "details-fields": [
        {
          name: "host",
          "display-name": "Host",
          "helper-text":
            "Your databases IP address (e.g. 98.137.149.56) or its domain name (e.g. esc.mydatabase.com).",
          placeholder: "name.database.com",
        },
        {
          name: "port",
          "display-name": "Port",
          type: "integer",
          description:
            "Leave empty to use Dynamic Ports, or input specific port. Standard port is 1433.",
        },
        {
          name: "db",
          "display-name": "Database name",
          placeholder: "BirdsOfTheWorld",
          required: true,
        },
        {
          name: "instance",
          "display-name": "Database instance name",
          placeholder: "N/A",
        },
        {
          name: "user",
          "display-name": "Username",
          placeholder: "username",
          required: true,
        },
        {
          name: "password",
          "display-name": "Password",
          type: "password",
          placeholder: "••••••••",
        },
        {
          name: "ssl",
          "display-name": "Use a secure connection (SSL)",
          type: "boolean",
          default: false,
        },
        {
          name: "rowcount-override",
          "display-name": "ROWCOUNT Override",
          placeholder: 0,
          required: false,
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
            "tunnel-enabled": true,
            "tunnel-auth-option": "password",
          },
        },
        {
          name: "tunnel-private-key",
          "display-name": "SSH private key to connect to the tunnel",
          type: "string",
          placeholder: "Paste the contents of an SSH private key here",
          required: true,
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "tunnel-private-key-passphrase",
          "display-name": "Passphrase for SSH private key",
          type: "password",
          placeholder: "******",
          "visible-if": {
            "tunnel-enabled": true,
            "tunnel-auth-option": "ssh-key",
          },
        },
        {
          name: "advanced-options",
          type: "section",
          default: false,
        },
        {
          name: "additional-options",
          "display-name": "Additional JDBC connection string options",
          "visible-if": {
            "advanced-options": true,
          },
          placeholder: "trustServerCertificate=false",
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
          },
        },
        {
          name: "schedules.metadata_sync",
          "display-name": "Database syncing",
          description:
            "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
          },
        },
        {
          name: "schedules.cache_field_values",
          "display-name": "Scanning for Filter Values",
          description:
            "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
          "visible-if": {
            "advanced-options": true,
            "let-user-control-scheduling": true,
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
          },
        },
      ],
      "driver-name": "SQL Server",
      "superseded-by": null,
    },
  },
};
