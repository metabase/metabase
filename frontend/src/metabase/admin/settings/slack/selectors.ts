import { State } from "metabase-types/store";
import { SlackSettings } from "metabase-types/api";

export const getSlackSettings = (state: State): SlackSettings => {
  return state.settings.values;
};

export const hasBotToken = (state: State): boolean => {
  return state.settings.values["slack-token"] != null;
};

export const hasSlackAppToken = (state: State): boolean => {
  return state.settings.values["slack-app-token"] != null;
};
