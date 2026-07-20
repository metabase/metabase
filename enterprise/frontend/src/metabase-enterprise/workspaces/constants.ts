import { isCypressActive } from "metabase/env";

export const POLLING_INTERVAL = isCypressActive ? 200 : 3000;
