import type { ExportFormat } from "metabase/common/types/export";

export const exportFormats: ExportFormat[] = ["csv", "xlsx", "json"];
export const exportFormatPng: ExportFormat = "png";

export function accountSettings() {
  return "/account/profile";
}
