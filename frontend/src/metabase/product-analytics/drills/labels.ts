import { t } from "ttag";

import type { Grain } from "../analyses/types";

/** The click action that drills to the actors in a cell. */
export const getSeeActorsTitle = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`See these people`;
    case "session":
      return t`See these sessions`;
    case "event":
      return t`See these events`;
  }
};

/** A drill's label when the analysis can't describe it. */
export const getClickedActorsLabel = (grain: Grain): string => {
  switch (grain) {
    case "person":
      return t`Clicked people`;
    case "session":
      return t`Clicked sessions`;
    case "event":
      return t`Clicked events`;
  }
};
