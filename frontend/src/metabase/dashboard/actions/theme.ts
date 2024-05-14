import { createAction } from "@reduxjs/toolkit";

import type { DisplayTheme } from "metabase/public/lib/types";

export const SET_DISPLAY_THEME = "metabase/dashboard/SET_DISPLAY_THEME";
export const setDisplayTheme = createAction<DisplayTheme>(SET_DISPLAY_THEME);
