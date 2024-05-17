import { c, t } from "ttag";

import Link from "metabase/core/components/Link";
import { color } from "metabase/lib/colors";
import { Flex, Icon, Text, Box } from "metabase/ui";
import type { CloudMigration } from "metabase-types/api/cloud-migration";

import { LargeIconContainer, MigrationCard } from "./CloudPanel.styled";
import { getMigrationEventTime } from "./utils";

interface MigrationErrorProps {
  migration: CloudMigration;
}

export const MigrationError = ({ migration }: MigrationErrorProps) => {
  const failedAt = getMigrationEventTime(migration.updated_at);

  return (
    <MigrationCard>
      <Flex gap="md">
        <LargeIconContainer color={color("error")}>
          <Icon size="1.5rem" name="warning" />
        </LargeIconContainer>
        <Box>
          <Text fw="bold">{t`Migration to Metabase Cloud failed`}</Text>
          <Text mt="1rem">
            {c("{0} is an email address")
              .jt`Please try again later, and reach out to us at ${(
              <Link key="email" variant="brand" to="mailto:help@metabase.com">
                help@metabase.com
              </Link>
            )} if you need help.`}
          </Text>
          <Text
            size="sm"
            mt=".5rem"
          >{t`Migration to Metabase Cloud failed on ${failedAt}.`}</Text>
        </Box>
      </Flex>
    </MigrationCard>
  );
};
