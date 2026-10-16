import { t } from "ttag";

import type { Grain } from "../../spec/types";

export const compileGrain = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return "person_id";
    case "session":
      return "session_id";
    case "event":
      return "event_id";
  }
};

export const grainLabel = (grain: Grain): string =>
  ({ person: "people", session: "sessions", event: "events" })[grain];

/** User-facing name for the column `grainLabel` names. */
export const grainTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`People`;
    case "session":
      return t`Sessions`;
    case "event":
      return t`Events`;
  }
};
