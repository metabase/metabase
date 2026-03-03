import type { AdvancedTransformType } from "metabase-types/api";

export const SHARED_LIB_IMPORT_PATHS: Record<AdvancedTransformType, string> = {
  python: "common.py",
  javascript: "common.js",
};
