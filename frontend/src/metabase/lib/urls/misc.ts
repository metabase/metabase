import type {
  ExportFormat,
  TableExportFormat,
} from "metabase/common/types/export";

export const exportFormats: TableExportFormat[] = ["csv", "xlsx", "json"];
export const exportFormatPng: ExportFormat = "png";

export function accountSettings() {
  return "/account/profile";
}
