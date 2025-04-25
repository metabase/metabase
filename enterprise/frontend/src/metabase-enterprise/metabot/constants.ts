import { t } from "ttag";

export function getErrorMessage() {
  return t`I'm currently offline, try again later.`;
}

// We don't need to translate this yet, as it's from ai-service which isn't translated
export const METABOT_RESULTS_MESSAGE = "Here are the results";
