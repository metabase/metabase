/**
 * User-friendly dashboard mode configuration
 * Defines what users can do with dashboards in terms they understand
 */

// Dashboard-level actions users can perform
export type DashboardActionType =
  | "edit"
  | "download-pdf"
  | "share"
  | "refresh"
  | "fullscreen"
  | "info"
  | "bookmark"
  | "duplicate";

// File formats users can download
export type DownloadFormat = "pdf" | "csv" | "xlsx" | "json";

// Drill types users can perform on charts (user-friendly names)
export type DrillType =
  | "column-filter"
  | "column-extract"
  | "distribution"
  | "fk-details"
  | "fk-filter"
  | "pivot"
  | "quick-filter"
  | "sort"
  | "summarize-column"
  | "summarize-column-by-time"
  | "underlying-records"
  | "zoom-binning"
  | "zoom-geographic"
  | "zoom-timeseries";

// Click actions users can perform on charts
export type ClickActionType =
  | "hide-column"
  | "format-column"
  | "extract-column"
  | "combine-columns"
  | "dashboard-click";

// Navigation options for clicking through to questions
export interface NavigationConfig {
  enabled: boolean;
  newTab?: boolean;
  customHandler?: (questionId: number, filters?: any) => void;
}

// Dashboard-level configuration
export interface DashboardConfig {
  actions: DashboardActionType[];
  downloads: DownloadFormat[];
  editing: boolean;
}

// Question-level configuration (for charts within the dashboard)
export interface QuestionConfig {
  drilling: boolean | DrillType[];
  clickActions: boolean | ClickActionType[];
  navigation: boolean | NavigationConfig;
  fallback?: "default" | "native-query";
}

// Full dashboard mode configuration
export interface DashboardModeConfig {
  name: string;
  dashboard: DashboardConfig;
  questions: QuestionConfig;
}

// Dashboard mode can be a string preset or full configuration
export type DashboardMode = string | DashboardModeConfig;

// Type for mode resolution result
export interface ResolvedDashboardMode {
  name: string;
  dashboard: DashboardConfig;
  questions: QuestionConfig;
}
