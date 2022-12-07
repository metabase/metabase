/**
 * ⚠️
 * @deprecated use existing types from, or add to metabase-types/api/*
 */

export type CollectionId = number;

export type Collection = {
  id: CollectionId;
  name: string;
  color: string;
};
