import { createMockMetadata } from "__support__/metadata";
import * as ML_Urls from "metabase-lib/v1/urls";
import type { Card, Table } from "metabase-types/api";

export function getExploreTableUrl(table: Table, card?: Card): string {
  const metadata = createMockMetadata({
    tables: table ? [table] : [],
  });
  const metadataTable = metadata?.table(table.id);
  let question = metadataTable?.newQuestion();
  if (card) {
    question = question?.setCard(card);
  }

  if (!question) {
    throw new Error("Unable to create question");
  }

  return ML_Urls.getUrl(question);
}
