import dayjs from "dayjs";
import { c, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { getStoreUrl } from "metabase/selectors/settings";
import {
  Card,
  type CardProps,
  Flex,
  Icon,
  Text,
  List,
  Button,
  Divider,
  Box,
} from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

interface MigrationSuccessProps extends Omit<CardProps, "children"> {
  migration: CloudMigration;
}

export const MigrationSuccess = ({
  migration,
  ...props
}: MigrationSuccessProps) => {
  const uploadedAt = dayjs(migration.updated_at).format(
    "MMMM DD, YYYY, hh:mm A",
  );

  return (
    <Card withBorder px="2.5rem" {...props}>
      <Flex gap="sm" c="success" align="center">
        <Icon name="check" />
        <Text fw="bold" c="success">
          {t`The snapshot has been uploaded to the Cloud`}
        </Text>
      </Flex>
      <Text my="sm">
        {t`Please complete the migration process on Metabase Store.`}
        <List size="md">
          <List.Item>{t`This instance is no longer in read-only mode.`}</List.Item>
          <List.Item>{c("{0} is the date and time the snapshot was uploaded")
            .t`Snapshot uploaded on ${uploadedAt}.`}</List.Item>
        </List>
      </Text>

      <Box mt="md">
        <ExternalLink href={getStoreUrl()}>
          <Button variant="filled">{t`Go to Metabase store`}</Button>
        </ExternalLink>
      </Box>

      <Divider my="lg" />

      {/* TODO: handle restarting */}
      <Button onClick={() => {}}>{t`Restart the process`}</Button>
    </Card>
  );
};
