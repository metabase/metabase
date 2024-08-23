import { createContext } from "react";

import { SEARCH_DEBOUNCE_DURATION } from "metabase/lib/constants";

// Used to disable wait time in loki snapshots
export const waitTimeContext = createContext<number>(SEARCH_DEBOUNCE_DURATION);
