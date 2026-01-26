import { blue, green, yellow } from "chalk";

import {
  CONTAINER_NAME,
  SAMPLE_CREDENTIALS_FILE_NAME,
  SDK_DOCS_LINK,
} from "./config";

export const SHOW_ON_STARTUP_MESSAGE = `
  This tool will spin up a local Metabase instance via Docker and help you get
  an embedded dashboard in your app.

  - You can't use this tool to connect to an existing Metabase instance.
  - The tool's default setup (which uses API keys) won’t work in production.
    It's only intended for you to quickly try out the SDK on your local machine.
    A production setup requires a Pro/Enterprise license and SSO with JWT.
`;

export const PACKAGE_JSON_NOT_FOUND_MESSAGE = `
  Could not find a package.json file in the current directory.
  Please run this command from the root of your project.
`;

export const MISSING_REACT_DEPENDENCY = `
  Your package.json file does not contain a dependency for React.
  Please make sure your package.json file contains a dependency for React 18 or React 19.
`;

export const UNSUPPORTED_REACT_VERSION = `
  Your app uses a version of React that is not supported.
  See https://metaba.se/sdk-docs

  Try downloading and running one of our samples instead:
  - React: https://metaba.se/sdk-sample-react
  - Next.js: https://metaba.se/sdk-sample-nextjs
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
  // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- link for the CLI message
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

export const SETUP_PRO_LICENSE_MESSAGE_WITH_SAMPLE_DATABASE = `
  You've chosen to use a sample database to explore Metabase.

  If you want to use this tool to set up permissions for multi-tenancy with JWT SSO,
  you'll need to select your own database.

  With the sample database selected, this tool will simply create a mock back-end server
  that signs people into Metabase, without setting up JWT SSO.
`;

export const SDK_LEARN_MORE_MESSAGE = `All done! 🚀 Learn more about the SDK here: ${green(
  SDK_DOCS_LINK,
)}`;

export const CONTINUE_SETUP_ON_WARNING_MESSAGE = `Do you want to continue setup?`;

export const LINK_TO_NEXT_JS_SAMPLE = `https://github.com/metabase/metabase-nextjs-sdk-embedding-sample`;

// eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- this is for the cli
export const LINK_TO_NEXT_JS_GUIDE = `https://www.metabase.com/docs/latest/embedding/sdk/next-js`;
