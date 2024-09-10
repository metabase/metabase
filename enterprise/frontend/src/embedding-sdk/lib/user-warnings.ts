import { t } from "ttag";

const ERROR_MESSAGE_MAP = {
  COULD_NOT_AUTHENTICATE: t`Could not authenticate: invalid JWT URI or JWT provider did not return a valid JWT token`,
  NO_AUTH_PROVIDED: t`No JWT URI or API key provided.`,
};

export const getErrorMessage = (key: keyof typeof ERROR_MESSAGE_MAP) =>
  ERROR_MESSAGE_MAP[key];
