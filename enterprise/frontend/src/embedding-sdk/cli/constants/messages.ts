import { CONTAINER_NAME } from "./config";

// eslint-disable-next-line no-unconditional-metabase-links-render -- link for the CLI message
export const ANONYMOUS_TRACKING_INFO = `
  Metabase will phone home some data collected via Google Analytics and Snowplow. 
  We don’t collect any usernames, emails, server IPs, database details of any kind, or 
  any personally identifiable information (PII).
  
  This anonymous data helps us understand how people are actually using Metabase, which 
  in turn helps us prioritize what to work on next.
  
  Read more: https://www.metabase.com/docs/latest/installation-and-operation/information-collection
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
