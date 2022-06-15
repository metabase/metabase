import { t } from "ttag";

export const LOADING_MESSAGE_BY_SETTING = {
  "doing-science": t`Doing science...`,
  "running-query": t`Running query...`,
  "loading-results": t`Loading results...`,
};

type LoadingMessageSettingValue = keyof typeof LOADING_MESSAGE_BY_SETTING;

export const getLoadingMessageOptions = () =>
  Object.keys(LOADING_MESSAGE_BY_SETTING).map(key => {
    return {
      value: key,
      name: LOADING_MESSAGE_BY_SETTING[key as LoadingMessageSettingValue],
    };
  });
