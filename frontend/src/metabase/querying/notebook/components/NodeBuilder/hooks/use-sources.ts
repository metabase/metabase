import { useMemo } from "react";

import {
  useListCardsQuery,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { getQuestionVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { Database } from "metabase-types/api";

import type { SourceItem } from "../types";

// Everything a table block can stand for: tables, models and saved
// questions. `GET /api/table` has no database filter, so all tables come at
// once and the picker groups them.
export function useSources() {
  const { data: databasesData } = useListDatabasesQuery();
  const { data: tables = [], isLoading } = useListTablesQuery();
  const { data: cards = [] } = useListCardsQuery();

  const databases = useMemo<Database[]>(
    () => databasesData?.data ?? [],
    [databasesData],
  );

  const sources = useMemo<SourceItem[]>(() => {
    const items: SourceItem[] = tables.map((table) => ({
      id: table.id,
      name: table.display_name,
      databaseId: table.db_id,
      kind: "table",
    }));
    cards.forEach((card) => {
      if (
        (card.type === "model" || card.type === "question") &&
        !card.archived &&
        card.database_id != null
      ) {
        items.push({
          id: getQuestionVirtualTableId(card.id),
          name: card.name,
          databaseId: card.database_id,
          kind: card.type,
        });
      }
    });
    return items;
  }, [tables, cards]);

  return { sources, databases, isLoading };
}
