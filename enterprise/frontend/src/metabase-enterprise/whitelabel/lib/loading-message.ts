import { t } from "ttag";

export const LOADING_MESSAGE_BY_SETTING = {
  "doing-science": {
    name: t`Doing science...`,
    value: (isSlow: boolean) =>
      isSlow ? t`Waiting for results...` : t`Doing science...`,
  },
  "running-query": {
    name: t`Running query...`,
    value: (_isSlow: boolean) => t`Running query...`,
  },
  "loading-results": {
    name: t`Loading results...`,
    value: (_isSlow: boolean) => t`Loading results...`,
  },
};

export const getLoadingMessageOptions = () =>
  Object.entries(LOADING_MESSAGE_BY_SETTING).map(([value, option]) => ({
    name: option.name,
    value,
  }));
