import { State } from "metabase-types/store";
import { SlackSettings } from "metabase-types/api";

export const getSlackSettings = (state: State): SlackSettings => {
  return state.settings.values;
};

export const hasSlackBotToken = (state: State): boolean => {
  return state.settings.values["slack-token"] != null;
};

export const hasSlackAppToken = (state: State): boolean => {
  return state.settings.values["slack-app-token"] != null;
};

export const isSlackTokenValid = (state: State): boolean | undefined => {
  return state.settings.values["slack-token-valid?"];
};
