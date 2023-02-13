import { CardDisplayType } from "./card";
export type SearchModelType =
  | "dashboard"
  | "card"
  | "dataset"
  | "collection"
  | "table"
  | "database";

export type SearchEntity = {
  id: number;
  name: string;
  model: SearchModelType;
  description?: string;
  display?: CardDisplayType;
};
