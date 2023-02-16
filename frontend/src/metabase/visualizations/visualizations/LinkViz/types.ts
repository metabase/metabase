import { SearchModelType, CardDisplayType } from "metabase-types/api";

export type LinkEntity = {
  id: number;
  db_id?: number;
  database_id?: number;
  model: SearchModelType;
  name: string;
  description?: string;
  display?: CardDisplayType;
};

export interface LinkCardSettings {
  link: {
    url?: string;
    entity?: LinkEntity;
  };
}
