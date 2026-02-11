import { jt, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { Text } from "metabase/ui";

export function DatabaseReplicationPostgresInfo() {
  const link = (
    <ExternalLink
      key="link"
      href="https://clickhouse.com/docs/integrations/clickpipes/postgres"
    >
      {t`adjust settings and permissions`}
    </ExternalLink>
  );

  return (
    <Text size="md" c="text-secondary">
      {jt`Note: You may need to ${link} in the source database. The process might also require a database restart.`}
    </Text>
  );
}
