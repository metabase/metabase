import type { CacheStrategy } from "metabase-types/api";

export const rootId = 0;

/** The implicit instance-wide policy when no root cache config exists */
export const defaultRootStrategy: CacheStrategy = { type: "nocache" };
