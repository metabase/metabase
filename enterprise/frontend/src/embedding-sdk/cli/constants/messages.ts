import { blue, green, yellow } from "chalk";

import {
  CONTAINER_NAME,
  SAMPLE_CREDENTIALS_FILE_NAME,
  SDK_NPM_LINK,
} from "./config";

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
  The Metabase instance has already been configured.
  ${DELETE_CONTAINER_MESSAGE}
`;

export const getGeneratedComponentFilesMessage = (path: string) => `
  Generated files with example React components in "${path}".
`;

export const getEmbeddingFailedMessage = (reason: string) => `
  Failed to enable embedding features.
  ${DELETE_CONTAINER_MESSAGE}

  Reason: ${reason}
`;

export const getMetabaseInstanceSetupCompleteMessage = (
  instanceUrl: string,
  email: string,
  password: string,
) =>
  // eslint-disable-next-line no-unconditional-metabase-links-render -- link for the CLI message
  `
  Metabase is running at ${blue(instanceUrl)}

  Log in with

  Email: "${blue(email)}"
  Password: "${blue(password)}"

  You can also find your login credentials at "${blue(SAMPLE_CREDENTIALS_FILE_NAME)}".

  Metabase will phone home some anonymous data collected via Snowplow.
  We don’t collect any usernames, emails, server IPs, database details of any kind, or
  any personally identifiable information (PII).

  This anonymous data helps us understand how people are actually using Metabase, which
  in turn helps us prioritize what to work on next.

  Read more: https://www.metabase.com/docs/latest/installation-and-operation/information-collection
`;

export const getNoTenantMessage = (unsampledTableNames: string[]) => {
  const tables = unsampledTableNames.join(", ");
  const warningTitle = `Sandboxing is not configured for the following tables: ${tables}.`;

  return `
  ${yellow(warningTitle)}

  To demo data sandboxing, you'll need at least one tenant.
  You can assign your tenant's ID to your user attribute, e.g., "customer_id: 5".
`;
};

export const SETUP_PRO_LICENSE_MESSAGE = `
  This tool can optionally set up permissions for multi-tenancy in your Metabase.
  It'll create a mock back-end server that signs people into Metabase
  so you can see how different tenants experience the dashboard embedded in your app.

  To set up multi-tenancy and SSO with JWT, you'll need a Pro license.

  If you skip this step, the setup will continue without multi-tenancy or SSO.
`;

export const SDK_LEARN_MORE_MESSAGE = `All done! 🚀 Learn more about the SDK here: ${green(
  SDK_NPM_LINK,
)}`;

export const CONTINUE_SETUP_ON_WARNING_MESSAGE = `Do you want to continue setup?`;
