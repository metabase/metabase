import { t } from "ttag";

export const LOADING_MESSAGE_BY_SETTING = {
  "doing-science": {
    get name() {
      return t`Doing science...`;
    },
    value: (isSlow?: boolean) =>
      isSlow ? t`Waiting for results...` : t`Doing science...`,
  },
  "running-query": {
    get name() {
      return t`Running query...`;
    },
    value: (_isSlow?: boolean) => t`Running query...`,
  },
  "loading-results": {
    get name() {
      return t`Loading results...`;
    },
    value: (_isSlow?: boolean) => t`Loading results...`,
  },
};

export const getLoadingMessageOptions = () =>
  Object.entries(LOADING_MESSAGE_BY_SETTING).map(([value, option]) => ({
    label: option.name,
    value,
  }));
