export type DashboardMode = "editable";

/**
 * @internal
 * Controls the behavior of the dashboard.
 * - `editable`: Allows editing and drill-throughs
 * - `interactive`: Allows drill-throughs only
 */
export type DashboardModeProp = { mode?: DashboardMode };
