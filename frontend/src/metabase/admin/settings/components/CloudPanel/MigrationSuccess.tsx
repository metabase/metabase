import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { color } from "metabase/lib/colors";
import { Flex, Icon, Text, Button, Box } from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { LargeIconContainer, MigrationCard } from "./CloudPanel.styled";
import { getMigrationEventTime } from "./utils";

interface MigrationSuccessProps {
  migration: CloudMigration;
  restartMigration: () => void;
  isRestarting: boolean;
  checkoutUrl: string;
}

export const MigrationSuccess = ({
  migration,
  restartMigration,
  isRestarting,
  checkoutUrl,
}: MigrationSuccessProps) => {
  const uploadedAt = getMigrationEventTime(migration.updated_at);

  return (
    <>
      <MigrationCard>
        <Flex gap="md">
          <LargeIconContainer color={color("success")}>
            <Icon size="1.5rem" name="check" />
          </LargeIconContainer>

          <Box>
            <Text fw="bold" mb="0.5rem">
              {t`The snapshot has been uploaded to the Cloud`}
            </Text>
            <Text size="sm">{t`On ${uploadedAt}`}</Text>
            <Text my="2rem">
              {t`To complete the migration, set up your account in the Metabase Store`}
            </Text>

            <Box mt="1.5rem">
              <ExternalLink href={checkoutUrl}>
                <Button variant="filled">{t`Go to Metabase Store`}</Button>
              </ExternalLink>
            </Box>
          </Box>
        </Flex>
      </MigrationCard>

      <Button
        variant="subtle"
        onClick={restartMigration}
        disabled={isRestarting}
        px="0"
        mt="1rem"
      >{t`Restart the process`}</Button>
    </>
  );
};
