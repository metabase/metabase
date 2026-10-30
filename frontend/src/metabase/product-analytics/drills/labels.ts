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
