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
    postgres: createMockEngine({
      "driver-name": "PostgreSQL",
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
    }),
  },
};
