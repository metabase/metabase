import { t } from "ttag";

export const LOADING_MESSAGE_BY_SETTING = {
  "doing-science": t`Doing science...`,
  "running-query": t`Running query...`,
  "loading-results": t`Loading results...`,
};

export const getLoadingMessageOptions = () =>
  Object.entries(LOADING_MESSAGE_BY_SETTING).map(([value, name]) => ({
    value,
    name,
  }));
