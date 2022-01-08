import { State } from "metabase-types/store";

export const getSlackBotToken = (state: State): string | undefined => {
  return state.settings.values["slack-token"];
};

export const hasSlackBotToken = (state: State): boolean => {
  return getSlackBotToken(state) != null;
};

export const getSlackAppToken = (state: State): string | undefined => {
  return state.settings.values["slack-app-token"];
};

export const hasSlackAppToken = (state: State): boolean => {
  return getSlackAppToken(state) != null;
};

export const getSlackFilesChannel = (state: State): string | undefined => {
  return state.settings.values["slack-files-channel"];
};
