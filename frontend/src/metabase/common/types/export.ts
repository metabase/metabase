export type TableExportFormat = "csv" | "xlsx" | "ods" | "json";
export type ExportFormat = TableExportFormat | "png";

export const exportFormats: TableExportFormat[] = [
  "csv",
  "xlsx",
  "ods",
  "json",
] as const;
export const exportFormatPng: ExportFormat = "png" as const;
