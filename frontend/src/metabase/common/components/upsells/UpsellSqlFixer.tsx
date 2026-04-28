import { t } from "ttag";

import { UpsellPill } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";

export const UpsellSqlFixerPill = ({ source }: { source: string }) => {
  const hasSqlFixer = useHasTokenFeature("ai_sql_fixer");
  const hasSqlGeneration = useHasTokenFeature("ai_sql_generation");

  if (hasSqlFixer || hasSqlGeneration) {
    return null;
  }

  return (
    <UpsellPill campaign="ai-sql-fixer" link={UPGRADE_URL} source={source}>
      {t`Have AI fix this query with Pro`}
    </UpsellPill>
  );
};
