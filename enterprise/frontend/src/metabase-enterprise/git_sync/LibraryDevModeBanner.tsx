import Link from "react-router/lib/Link";
import { t } from "ttag";

import { Box, Button, Flex, Icon, Text } from "metabase/ui";

export const LibraryDevModeBanner = () => {
  return (
    <>
      <Box
        px="1.5rem"
        py=".75rem"
        bg="brand"
        w="100%"
        data-testid="archive-banner"
      >
        <Flex justify="space-between" align="center" c="white">
          <Flex align="center" gap="sm">
            <Icon name="pencil" size={24} c="white" />
            <Text c="white" lh="sm">
              {t`The Library is in developer mode. Changes are allowed to library items. Proceed with caution and turn off developer mode when done.`}
            </Text>
          </Flex>
          <Button
            leftSection={<Icon name="gear" c="white" />}
            variant="subtle"
            component={Link}
            to="/admin/settings/library"
          />
        </Flex>
      </Box>
    </>
  );
};
