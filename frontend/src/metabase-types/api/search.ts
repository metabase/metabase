import type {
  Card,
  Dashboard,
  Collection,
  Table,
  Database,
  ModelType,
} from "./index";

export type SearchModelType =
  | "dashboard"
  | "card"
  | "dataset"
  | "collection"
  | "table"
  | "database";

type Entity = Card | ModelType | Dashboard | Collection | Table | Database;

export type SearchEntity = Entity & {
  name: string;
  id: number;
  model: SearchModelType;
};
