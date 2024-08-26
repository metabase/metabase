import chalk from "chalk";

import { HARDCODED_USERS } from "../constants/hardcoded-users";

import { CONTAINER_NAME, USER_ATTRIBUTE_CUSTOMER_ID } from "./config";

export const PACKAGE_JSON_NOT_FOUND_MESSAGE = `
  Could not find a package.json file in the current directory.
  Please run this command from the root of your project.
`;

export const MISSING_REACT_DEPENDENCY = `
  Your package.json file does not contain a dependency for React.
  Please make sure your package.json file contains a dependency for React 18.
`;

export const UNSUPPORTED_REACT_VERSION = `
  Your package.json file contains an unsupported React version.
  Please make sure your package.json file contains a dependency for React 18.
`;

export const DELETE_CONTAINER_MESSAGE = `Please delete the container with "docker rm -f ${CONTAINER_NAME}" and try again.`;

export const INSTANCE_CONFIGURED_MESSAGE = `
  The instance has already been configured.
  ${DELETE_CONTAINER_MESSAGE}
`;

export const PREMIUM_TOKEN_REQUIRED_MESSAGE =
  "  Don't forget to add your premium token to your Metabase instance in the admin settings! The embedding demo will not work without a license.";

export const NO_TENANCY_COLUMN_WARNING_MESSAGE = `
  Your have not selected any tables with a multi-tenancy column.
  You can still use the SDK, but you will not be able to sandbox your tables.
`;

export const getGeneratedComponentFilesMessage = (path: string) => `
  Generated example React components files in "${path}".
`;

export const getEmbeddingFailedMessage = (reason: string) => `
  Failed to enable embedding features.
  ${DELETE_CONTAINER_MESSAGE}

  Reason: ${reason}
`;

export const getMetabaseInstanceSetupCompleteMessage = (instanceUrl: string) =>
  // eslint-disable-next-line no-unconditional-metabase-links-render -- link for the CLI message
  `
  Metabase is running at ${chalk.blue(instanceUrl)}
  You can find your login credentials at METABASE_LOGIN.json
  Don't forget to put this file in your .gitignore.

  Metabase will phone home some data collected via Snowplow.
  We don’t collect any usernames, emails, server IPs, database details of any kind, or
  any personally identifiable information (PII).

  This anonymous data helps us understand how people are actually using Metabase, which
  in turn helps us prioritize what to work on next.

  Read more: https://www.metabase.com/docs/latest/installation-and-operation/information-collection
`;

export const getExpressServerGeneratedMessage = (filePath: string) => `
  Generated an example Express.js server in "${filePath}".
`;

export const NOT_ENOUGH_TENANCY_COLUMN_ROWS = `
  At least ${HARDCODED_USERS.length} rows with valid tenancy columns are needed for sandboxing.
  You can add your tenant's IDs to the "${USER_ATTRIBUTE_CUSTOMER_ID}" user attribute in settings.
`;

export const SETUP_PRO_LICENSE_MESSAGE = `
  This tool can set up permissions for multi-tenancy and a mock back-end server that
  signs users into Metabase to emulate the experience from different tenants.

  To proceed, you will need a Pro license.
  If you skip, we will proceed without multi-tenancy or SSO.
`;
