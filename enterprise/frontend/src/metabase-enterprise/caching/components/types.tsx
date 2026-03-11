import type {
  CacheConfig,
  CacheStrategy,
  CacheableModel,
  CollectionEssentials,
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

export type UpdateTarget = (
  newValues: { id: number | null; model: CacheableModel | null },
  isFormDirty: boolean,
) => void;
