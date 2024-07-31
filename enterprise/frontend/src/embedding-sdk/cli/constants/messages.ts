import { CONTAINER_NAME } from "./config";

export const INSTALL_SDK_MESSAGE = `
  Install the npm package on another terminal by running:
  npm install --save @metabase/embedding-sdk-react
`;

export const DOCS_MESSAGE = `
Metabase is running in a Docker container. To stop it, run "docker stop ${CONTAINER_NAME}".
Documentation for the SDK can be found here: https://www.npmjs.im/@metabase/embedding-sdk-react
`;

export const ANONYMOUS_TRACKING_INFO = `
By default, Metabase will phone home some data collected via Google Analytics and Snowplow.
We don’t collect any usernames, emails, server IPs, database details of any kind, or any personally identifiable information (PII).

This anonymous data helps us understand how people are actually using Metabase, which in turn helps us prioritize what to work on next.

You can opt out by:

1. Click on the gear icon.
2. Select Admin settings.
3. Go to the Settings tab.
4. Click General
5. Toggle the Anonymous tracking option.
`;

export const SDK_PACKAGE_NOT_FOUND_MESSAGE = `
    The @metabase/embedding-sdk-react package is not installed.
    
    ${INSTALL_SDK_MESSAGE}
    `;

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

export const EMBEDDING_FAILED_MESSAGE = `
  Failed to enable embedding features.
  ${DELETE_CONTAINER_MESSAGE}
`;

export const CREATE_ADMIN_USER_FAILED_MESSAGE = `
  Failed to create the admin user.
  ${DELETE_CONTAINER_MESSAGE}
`;

export const START_MESSAGE = `
  This utility will help you bootstrap a local Metabase instance and embed
  analytics into your React app using the Metabase Embedding SDK.
`;

export const DOCKER_NOT_RUNNING_MESSAGE = `
  Docker is not running. Please install and start the Docker daemon before running this command.
  For more information, see https://docs.docker.com/engine/install
`;

export const INSTANCE_NOT_READY_ERROR = `
  Could not connect to your local Metabase instance.
  ${DELETE_CONTAINER_MESSAGE}
`;
