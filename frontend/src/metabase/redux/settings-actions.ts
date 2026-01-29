import { createAction } from "@reduxjs/toolkit";

import type { Settings } from "metabase-types/api";

/**
 * Action to load settings into Redux state.
 * Extracted to a separate file to avoid circular dependency with metabase/api/session.
 */
export const loadSettings = createAction<Settings>(
  "metabase/settings/LOAD_SETTINGS",
);
