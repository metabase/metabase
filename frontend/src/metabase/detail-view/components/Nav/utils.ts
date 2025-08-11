import { createMockMetadata } from "__support__/metadata";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Table } from "metabase-types/api";

export function getExploreTableUrl(table: Table): string {
  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
  const metadataTable = metadata?.table(table.id);
  const question = metadataTable?.newQuestion();

  if (!question) {
    throw new Error("Unable to create question");
  }

  return ML_Urls.getUrl(question);
}
