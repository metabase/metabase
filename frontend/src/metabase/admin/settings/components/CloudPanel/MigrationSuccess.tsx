import { c, t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Flex, Icon, Text, List, Button, Divider, Box } from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { LargeIconContainer, MigrationCard } from "./CloudPanel.styled";
import { getCheckoutUrl, getMigrationEventTime } from "./utils";

interface MigrationSuccessProps {
  migration: CloudMigration;
  restartMigration: () => void;
  isRestarting: boolean;
}

export const MigrationSuccess = ({
  migration,
  restartMigration,
  isRestarting,
}: MigrationSuccessProps) => {
  const uploadedAt = getMigrationEventTime(migration.updated_at);

  return (
    <MigrationCard>
      <Flex gap="md">
        <LargeIconContainer color={color("success")}>
          <Icon size="1.5rem" name="check" />
        </LargeIconContainer>

        <Box>
          <Text fw="bold">
            {t`The snapshot has been uploaded to the Cloud`}
          </Text>
          <Text my="sm" size="sm">
            {t`Please complete the migration process on the Metabase Store.`}
            <List size="md">
              <List.Item>
                <Text size="sm">{t`This instance is no longer in read-only mode.`}</Text>
              </List.Item>
              <List.Item>
                <Text size="sm">{c(
                  "{0} is the date and time the snapshot was uploaded",
                ).t`Snapshot uploaded on ${uploadedAt}.`}</Text>
              </List.Item>
            </List>
          </Text>

          <Box mt="1.5rem">
            <ExternalLink href={getCheckoutUrl(migration)}>
              <Button variant="filled">{t`Go to Metabase store`}</Button>
            </ExternalLink>
          </Box>

          <Divider mt="2rem" />

          <Button
            variant="subtle"
            onClick={restartMigration}
            disabled={isRestarting}
            px="0"
            mt="1rem"
          >{t`Restart the process`}</Button>
        </Box>
      </Flex>
    </MigrationCard>
  );
};
