import { getMetabotInitialState } from "metabase/metabot/state/reducer-utils";
import type { MetabotState } from "metabase/metabot/state/types";

export const createMockMetabotState = (): MetabotState => {
  return getMetabotInitialState();
};
