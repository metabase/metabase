import { t } from "ttag";

import type { Grain } from "../spec/types";

export const getSeeMembersTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`See these people`;
    case "session":
      return t`See these sessions`;
    case "event":
      return t`See these events`;
  }
};

export const getStartAnalysisTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Start a new analysis on these people`;
    case "session":
      return t`Start a new analysis on these sessions`;
    case "event":
      return t`Start a new analysis on these events`;
  }
};

export const getSaveSegmentTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Save these people as a segment`;
    case "session":
      return t`Save these sessions as a segment`;
    case "event":
      return t`Save these events as a segment`;
  }
};

/** What a single actor is called, e.g. as a column header. */
export const getActorTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Person`;
    case "session":
      return t`Session`;
    case "event":
      return t`Event`;
  }
};
