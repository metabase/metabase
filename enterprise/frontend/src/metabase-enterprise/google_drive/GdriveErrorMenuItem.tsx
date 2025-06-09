import { t } from "ttag";

import { Box, Flex, Icon, Menu, Text } from "metabase/ui";

import { getErrorMessage } from "./utils";

export function GdriveErrorMenuItem({
  error,
  hasDivider = true,
}: {
  error: any;
  hasDivider?: boolean;
}) {
  if (!error) {
    return null;
  }

  return (
    <>
      {hasDivider && <Menu.Divider />}
      <Menu.Label>
        <Flex>
          <Icon name="warning" c="error" mt="xs" mr="sm" />
          <Box>
            <Text fw="bold">{t`Couldn't sync Google Sheets`}</Text>
            <Text size="sm" c="text-medium" maw="16rem">
              {getErrorMessage(error)}
            </Text>
          </Box>
        </Flex>
      </Menu.Label>
    </>
  );
}
