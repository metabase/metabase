import type { exportFormats } from "metabase/lib/urls";

export type ExportFormatType = typeof exportFormats[number] | null;
