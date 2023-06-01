import { DatabaseId } from "metabase-types/api/database";

export interface DatabaseCandidate {
  id: string;
  schema: string;
  tables: TableCandidate[];
}

export interface TableCandidate {
  title: string;
  url: string;
}

export interface DatabaseCandidateListQuery {
  id: DatabaseId;
}
