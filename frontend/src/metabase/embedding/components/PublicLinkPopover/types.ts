import type { exportFormats } from "metabase/utils/urls";

export type ExportFormatType = (typeof exportFormats)[number] | null;
