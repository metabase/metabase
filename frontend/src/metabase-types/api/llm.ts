import type { DatabaseId } from "./database";

export interface GenerateSqlRequest {
  prompt: string;
  database_id: DatabaseId;
  buffer_id?: string;
}

export interface GenerateSqlResponse {
  parts: Array<{
    type: "code_edit";
    version: number;
    value: {
      buffer_id: string;
      mode: "rewrite";
      value: string;
    };
  }>;
}
