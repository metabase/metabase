import { isCypressActive } from "metabase/env";

export const NAME_MAX_LENGTH = 254;

export const POLLING_INTERVAL = isCypressActive ? 100 : 3000;
