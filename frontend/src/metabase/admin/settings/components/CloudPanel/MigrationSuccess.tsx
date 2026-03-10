import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import type { Plan } from "metabase/common/utils/plan";
import { color } from "metabase/lib/colors";
import { Box, Button, Flex, Icon, Text } from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { LargeIconContainer, MigrationCard } from "./CloudPanel.styled";
import { getMigrationEventTime, getMigrationUrl } from "./utils";

interface MigrationSuccessProps {
  storeUrl: string;
  plan: Plan;
  migration: CloudMigration;
  restartMigration: () => void;
  isRestarting: boolean;
}

export const MigrationSuccess = ({
  storeUrl,
  plan,
  migration,
  restartMigration,
  isRestarting,
}: MigrationSuccessProps) => {
  const uploadedAt = getMigrationEventTime(migration.updated_at);
  const migrationUrl = getMigrationUrl(storeUrl, plan, migration);

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
              <ExternalLink href={migrationUrl}>
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
