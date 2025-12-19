import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { Box, Flex, Icon, Menu, Text } from "metabase/ui";

export function GdriveErrorMenuItem({ error }: { error: any }) {
  if (!error) {
    return null;
  }

  return (
    <>
      <Menu.Label>
        <Flex>
          <Icon name="warning" c="error" mt="xs" mr="sm" />
          <Box>
            <Text fw="bold">{t`Couldn't sync Google Sheets`}</Text>
            <Text size="sm" c="text-secondary" maw="16rem">
              {getErrorMessage(
                error,
                // eslint-disable-next-line no-literal-metabase-strings -- admin only ui
                t`Please check that the folder is shared with the Metabase Service Account.`,
              )}
            </Text>
          </Box>
        </Flex>
      </Menu.Label>
    </>
  );
}
