import Link from "react-router/lib/Link";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Flex, Icon, Text } from "metabase/ui";

export const RemoteSyncReadOnlyBanner = () => {
  const isAdmin = useSelector(getUserIsAdmin);

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
              {t`This collection is read-only because it's synchronized with a remote Git repository`}
            </Text>
          </Flex>
          {isAdmin && (
            <Button
              leftSection={<Icon name="gear" c="white" />}
              variant="subtle"
              component={Link}
              to="/admin/settings/remote-sync"
            >
              {t`Configure remote sync`}
            </Button>
          )}
        </Flex>
      </Box>
    </>
  );
};
