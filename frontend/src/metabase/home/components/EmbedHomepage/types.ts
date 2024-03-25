import type { Settings } from "metabase-types/api";

export type EmbedHomepageDismissReason = Exclude<
  Settings["embedding-homepage"],
  "visible" | "hidden"
>;
