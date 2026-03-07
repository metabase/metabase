import type { MetabaseClient } from "./client.js";
import { CliError } from "./validation.js";

interface FieldInfo {
  id: number;
  name: string;
  display_name: string;
  base_type: string;
  semantic_type: string | null;
}

/**
 * Resolves human-readable field names to numeric field IDs.
 * Caches table metadata to avoid redundant API calls within a session.
 */
export class FieldResolver {
  private cache = new Map<number, FieldInfo[]>();
  private client: MetabaseClient;

  constructor(client: MetabaseClient) {
    this.client = client;
  }

  /**
   * Resolve a field reference to a numeric ID.
   * Accepts: numeric ID (passthrough), field name string (looked up from table metadata).
   */
  async resolve(tableId: number, fieldRef: string | number): Promise<number> {
    if (typeof fieldRef === "number") return fieldRef;

    // If it's a string that parses as a number, treat as numeric ID
    const asNum = Number(fieldRef);
    if (!isNaN(asNum) && Number.isInteger(asNum)) return asNum;

    const fields = await this.getTableFields(tableId);
    const match = fields.find(
      (f) =>
        f.name.toLowerCase() === fieldRef.toLowerCase() ||
        f.display_name.toLowerCase() === fieldRef.toLowerCase(),
    );

    if (!match) {
      const available = fields.map((f) => f.name);
      // Simple did-you-mean: find closest by edit distance
      const suggestion = findClosest(fieldRef, available);
      throw new CliError("unknown_field", {
        message: `Field '${fieldRef}' not found on table ${tableId}`,
        hint: suggestion
          ? `Did you mean '${suggestion}'? Available fields: ${available.join(", ")}`
          : `Available fields: ${available.join(", ")}`,
        details: { available_fields: available },
      });
    }

    return match.id;
  }

  async getTableFields(tableId: number): Promise<FieldInfo[]> {
    if (this.cache.has(tableId)) {
      return this.cache.get(tableId)!;
    }

    const { data } = await this.client.GET(
      `/api/table/${tableId}/query_metadata`,
    );

    const raw = data as {
      fields?: Array<{
        id: number;
        name: string;
        display_name: string;
        base_type: string;
        semantic_type: string | null;
      }>;
    };
    const fields: FieldInfo[] = (raw?.fields ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      display_name: f.display_name,
      base_type: f.base_type,
      semantic_type: f.semantic_type,
    }));

    this.cache.set(tableId, fields);
    return fields;
  }
}

/** Simple Levenshtein-based closest match */
function findClosest(
  target: string,
  candidates: string[],
): string | undefined {
  const t = target.toLowerCase();
  let best: string | undefined;
  let bestDist = Infinity;

  for (const c of candidates) {
    const d = levenshtein(t, c.toLowerCase());
    if (d < bestDist && d <= Math.max(t.length, c.length) * 0.5) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0),
  );
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}
