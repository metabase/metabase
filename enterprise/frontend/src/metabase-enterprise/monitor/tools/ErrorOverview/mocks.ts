import type { ErroringCard } from "./types";

export function createMockErroringCard(
  card: Partial<ErroringCard> = {},
): ErroringCard {
  const id = card.id ?? 1;
  return {
    id,
    card_name: `Question ${id}`,
    error_substr: "Syntax error...",
    collection_name: "Our Analytics",
    database_name: "Sample Database",
    schema_name: "PUBLIC",
    table_name: "ORDERS",
    last_run_at: "2026-07-01T10:00:00Z",
    total_runs: 10,
    num_dashboards: 2,
    user_name: "John Doe",
    updated_at: "2026-06-30T10:00:00Z",
    ...card,
  };
}
