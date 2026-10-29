import { t } from "ttag";

import type { ActorGrain } from "../spec/types";

export const getSeeMembersTitle = (grain: ActorGrain): string => {
  switch (grain) {
    case "person":
      return t`See these people`;
    case "session":
      return t`See these sessions`;
  }
};
