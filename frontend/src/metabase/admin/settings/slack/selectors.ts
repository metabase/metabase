import { getSetting } from "metabase/selectors/settings";
import type { SlackSettings } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const getSlackSettings = (state: State): SlackSettings => {
  return {
    "slack-app-token": getSetting(state, "slack-app-token"),
    "slack-files-channel": getSetting(state, "slack-files-channel"),
  };
};

export const hasSlackBotToken = (state: State): boolean => {
  return getSetting(state, "slack-token") != null;
};

export const hasSlackAppToken = (state: State): boolean => {
  return getSetting(state, "slack-app-token") != null;
};

export const isSlackTokenValid = (state: State): boolean | undefined => {
  return getSetting(state, "slack-token-valid?");
};
