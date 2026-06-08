import type { CollectionId } from "metabase-types/api";

export interface ExplorationCollection {
  id?: CollectionId;
  name: string;
}

export type NewExplorationMode = "entry" | "plan";
