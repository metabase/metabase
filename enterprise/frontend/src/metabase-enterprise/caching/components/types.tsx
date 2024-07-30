import type {
  CacheConfig,
  CollectionEssentials,
  CacheStrategy,
  SearchResult,
  CacheableModel,
  SearchModel,
} from "metabase-types/api";

/** Something with a configurable cache strategy */
export type CacheableItem = Omit<CacheConfig, "model_id"> & {
  id: number;
  name?: string;
  collection?: CollectionEssentials;
  strategy?: CacheStrategy;
  /** In the sense of 'type of object' */
  iconModel?: SearchModel;
};

export type DashboardResult = SearchResult<number, "dashboard">;
export type QuestionResult = SearchResult<number, "card">;

export type UpdateTarget = (
  newValues: { id: number | null; model: CacheableModel | null },
  isFormDirty: boolean,
) => void;
