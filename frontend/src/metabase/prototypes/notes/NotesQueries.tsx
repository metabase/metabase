import type { ComponentType } from "react";

import {
  skipToken,
  useGetAdhocQueryQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import { Loader, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { RowValue } from "metabase-types/api";

type CaseRow = { label: string; reviews: number; orders: number };

// One row per case. Kept to SELECTs and joins every Sample Database engine
// (H2, SQLite) runs.
const RATING_CASES_SQL = `SELECT 'No filter' AS label,
  (SELECT COUNT(*) FROM REVIEWS) AS reviews,
  (SELECT COUNT(*) FROM ORDERS) AS orders
UNION ALL
SELECT 'Pill: review Rating ≤ 2',
  (SELECT COUNT(*) FROM REVIEWS WHERE RATING <= 2),
  (SELECT COUNT(*) FROM ORDERS)
UNION ALL
SELECT 'Metric: product Rating ≤ 2',
  (SELECT COUNT(*) FROM REVIEWS r JOIN PRODUCTS p ON r.PRODUCT_ID = p.ID WHERE p.RATING <= 2),
  (SELECT COUNT(*) FROM ORDERS o JOIN PRODUCTS p ON o.PRODUCT_ID = p.ID WHERE p.RATING <= 2)`;

// Keyed by the SQL labels above.
const CASE_MEANINGS: Record<string, string> = {
  "No filter": "Reviews for every 100 orders.",
  "Pill: review Rating ≤ 2": "1–2 star reviews for every 100 orders.",
  "Metric: product Rating ≤ 2":
    "Reviews that products rated 2 or less get, per 100 orders of those products.",
};

function toCaseRow([label, reviews, orders]: RowValue[]): CaseRow | null {
  const isCaseRow =
    typeof label === "string" &&
    typeof reviews === "number" &&
    typeof orders === "number";
  return isCaseRow ? { label, reviews, orders } : null;
}

const formatCount = (count: number) => count.toLocaleString("en-US");

const formatPer100 = ({ reviews, orders }: CaseRow) =>
  orders > 0 ? ((reviews / orders) * 100).toFixed(2) : "—";

/** The Rating example run live against the Sample Database. */
function RatingCasesTable() {
  const { data: databases } = useListDatabasesQuery();
  const sampleId = databases?.data.find((database) => database.is_sample)?.id;
  const provider = useMetadataProvider(sampleId ?? null);
  const query =
    sampleId != null && provider != null
      ? Lib.toJsQuery(Lib.nativeQuery(sampleId, provider, RATING_CASES_SQL))
      : null;
  const { data, error, isFetching } = useGetAdhocQueryQuery(query ?? skipToken);

  if (error || data?.error) {
    return (
      <Text c="text-secondary">{`Query failed: ${String(data?.error ?? "")}`}</Text>
    );
  }
  if (!data || isFetching) {
    return <Loader size="sm" />;
  }

  const rows = data.data.rows
    .map(toCaseRow)
    .filter((row): row is CaseRow => row != null);

  return (
    <>
      <table>
        <thead>
          <tr>
            <th />
            <th align="right">Reviews</th>
            <th align="right">Orders</th>
            <th align="right">Reviews per 100 orders</th>
            <th>What it measures</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td align="right">{formatCount(row.reviews)}</td>
              <td align="right">{formatCount(row.orders)}</td>
              <td align="right">
                <strong>{formatPer100(row)}</strong>
              </td>
              <td>{CASE_MEANINGS[row.label]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary>SQL</summary>
        <pre>
          <code>{RATING_CASES_SQL}</code>
        </pre>
      </details>
    </>
  );
}

/** Live blocks notes.md places with `<div data-query="name"></div>`. */
export const NOTES_QUERIES: Record<string, ComponentType> = {
  "rating-cases": RatingCasesTable,
};
