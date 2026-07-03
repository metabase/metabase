import type { MetabaseCard } from "embedding-sdk-bundle/types/question";
import { deserializeCardFromQuery } from "metabase/common/utils/card";
import type { DatasetQuery, UnsavedCard } from "metabase-types/api";

export function resolveCardProp(
  input: string | MetabaseCard,
): UnsavedCard | null {
  if (typeof input === "string") {
    // A card copied from a question URL hash (`/question#<base64>` or bare base64).
    try {
      return deserializeCardFromQuery(input);
    } catch {
      console.warn(
        // eslint-disable-next-line metabase/no-literal-metabase-strings
        "InteractiveQuestion/StaticQuestion: the `card` string could not be parsed as a serialized question. Pass a value copied from a question URL hash, or a MetabaseCard object.",
      );
      return null;
    }
  }

  const shouldSetDisplayLock =
    input.visualization != null || input.displayIsLocked != null;

  return {
    dataset_query: input.query as DatasetQuery,
    // Public-facing `visualization` maps to the internal card `display`. When
    // omitted, mirror the legacy `query` prop and let query results pick a
    // better unlocked display later.
    display: input.visualization ?? "table",
    ...(shouldSetDisplayLock
      ? {
          // Default to locking an explicitly chosen display so the query builder
          // doesn't reset it to a "sensible default" after results load.
          displayIsLocked: input.displayIsLocked ?? true,
        }
      : {}),
    visualization_settings: input.visualizationSettings ?? {},
  };
}
