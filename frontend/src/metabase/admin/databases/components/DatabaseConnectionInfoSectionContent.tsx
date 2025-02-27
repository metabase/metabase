import { t } from "ttag";

import { Box, Button, Flex, Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";

export const DatabaseConnectionInfoSectionContent = ({
  database,
}: {
  database: Database;
}) => {
  return (
    <Flex align="center" justify="space-between">
      <Flex align="center" gap="xs">
        <Box
          w=".75rem"
          h=".75rem"
          style={{ borderRadius: "50%", background: "green" }}
        />
        <Text c="black">{(database?.details?.host as any) ?? ""}</Text>
      </Flex>
      <Button>{t`Edit`}</Button>
    </Flex>
  );
};
