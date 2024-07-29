import { t } from "ttag";

const ERROR_MESSAGE_MAP = {
  PROD_API_KEY: t`You are using API keys. This is only supported for evaluation purposes, has limited feature coverage, and will only work on http://localhost. For regular use, please implement SSO (https://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md#authenticate-users-from-your-back-end)`,
  COULD_NOT_AUTHENTICATE: t`Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token`,
  NO_AUTH_PROVIDED: t`No JWT URI or API key provided.`,
};
export const getErrorMessage = (key: keyof typeof ERROR_MESSAGE_MAP) =>
  ERROR_MESSAGE_MAP[key];
