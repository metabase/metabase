import dayjs from "dayjs";
import { c, t } from "ttag";

import Link from "metabase/core/components/Link";
import { Card, type CardProps, Flex, Icon, Text } from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

interface MigrationErrorProps extends Omit<CardProps, "children"> {
  migration: CloudMigration;
}

export const MigrationError = ({
  migration,
  ...props
}: MigrationErrorProps) => {
  const failedAt = dayjs(migration.updated_at).format("MMMM DD, YYYY, hh:mm A");

  return (
    <Card withBorder px="2.5rem" {...props}>
      <Flex gap="sm" c="error" align="center">
        <Icon name="warning" />
        <Text fw="bold" c="error">
          {t`Migration to cloud failed.`}
        </Text>
      </Flex>
      <Text my="sm">
        {c("{0} indicates an email address to which to requrest migration help")
          .jt`Please try again later, and reach out to us at ${(
          <Link key="email" variant="brand" to="mailto:help@metabase.com">
            {t`help@metabase.com`}
          </Link>
        )} if you need help.`}
      </Text>
      <Text>{t`Migration to Metabase Cloud failed on ${failedAt}.`}</Text>
    </Card>
  );
};
