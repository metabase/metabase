import { isCypressActive } from "metabase/env";

export const NAME_MAX_LENGTH = 254;

export const POLLING_INTERVAL = isCypressActive ? 100 : 3000;

export const FILTER_WIDGET_MIN_WIDTH = 300;
export const FILTER_WIDGET_MAX_HEIGHT = 400;

export const SHARED_LIB_IMPORT_PATH = "common.py";
