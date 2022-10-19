import type Table from "metabase-lib/lib/metadata/Table";
import type Schema from "metabase-lib/lib/metadata/Schema";

export interface VirtualTable {
  id: Table["id"];
  display_name: string;
  schema: {
    id: Schema["id"];
  };
}
