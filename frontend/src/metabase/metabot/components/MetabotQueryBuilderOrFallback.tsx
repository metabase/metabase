import { MetabotQueryBuilder } from "metabase/metabot/components/MetabotQueryBuilder";
import { useMetabotEnabledEmbeddingAware } from "metabase/metabot/hooks";
import { QueryBuilder } from "metabase/query_builder/containers/QueryBuilder";

/**
 * A wrapper component that renders MetabotQueryBuilder if metabot is enabled,
 * otherwise falls back to the regular QueryBuilder.
 */
export function MetabotQueryBuilderOrFallback(props: any) {
  const isMetabotEnabled = useMetabotEnabledEmbeddingAware();
  return isMetabotEnabled ? (
    <MetabotQueryBuilder {...props} />
  ) : (
    <QueryBuilder {...props} />
  );
}
