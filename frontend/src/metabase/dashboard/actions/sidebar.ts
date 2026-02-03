/**
 * Sidebar actions for dashboard.
 * Extracted to avoid circular dependency between ui.ts and parameters.tsx
 */
import { createAction } from "metabase/lib/redux";

export const SET_SIDEBAR = "metabase/dashboard/SET_SIDEBAR";
export const setSidebar = createAction(SET_SIDEBAR);

export const CLOSE_SIDEBAR = "metabase/dashboard/CLOSE_SIDEBAR";
export const closeSidebar = createAction(CLOSE_SIDEBAR);
