import { t } from "ttag";

export const LOADING_MESSAGE_BY_SETTING = {
  "doing-science": {
    initial: t`Doing science...`,
    slow: t`Talking to the database...`,
  },
  "running-query": {
    initial: t`Running query...`,
    slow: t`Talking to the database...`,
  },
  "loading-results": {
    initial: t`Loading results...`,
    slow: t`Talking to the database...`,
  },
};

export const getLoadingMessageOptions = () =>
  Object.entries(LOADING_MESSAGE_BY_SETTING).map(([value, name]) => ({
    value,
    name,
  }));
