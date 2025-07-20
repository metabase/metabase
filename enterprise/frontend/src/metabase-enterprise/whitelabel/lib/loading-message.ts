import { t } from "ttag";

export const LOADING_MESSAGE_BY_SETTING = {
  "doing-science": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Doing science...`,
    value: (isSlow: boolean) =>
      isSlow ? t`Waiting for results...` : t`Doing science...`,
  },
  "running-query": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Running query...`,
    value: (_isSlow: boolean) => t`Running query...`,
  },
  "loading-results": {
    // eslint-disable-next-line ttag/no-module-declaration -- see metabase#55045
    name: t`Loading results...`,
    value: (_isSlow: boolean) => t`Loading results...`,
  },
};

export const getLoadingMessageOptions = () =>
  Object.entries(LOADING_MESSAGE_BY_SETTING).map(([value, option]) => ({
    label: option.name,
    value,
  }));
