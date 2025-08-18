import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Box, Button, Flex, Group, Stack, Text, Title } from "metabase/ui";

export const DatabaseReplicationError = ({
  error,
  onClose,
}: {
  error?: string;
  onClose: () => void;
}) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);
  return (
    <Stack align="center" gap="lg" my="4.5rem">
      <Box ta="center">
        <Title c="text-primary" fz="lg">{t`Couldn't replicate database`}</Title>
        <Text c="text-secondary" fz="md" lh={1.43}>
          {error ?? "Unknown error"}
        </Text>
      </Box>

      <Flex justify="end">
        <Group align="center">
          {showMetabaseLinks && (
            <ExternalLink
              role="link"
              href="https://www.metabase.com/docs/latest/"
            >{t`Read the docs`}</ExternalLink>
          )}
          <Button onClick={onClose} size="md" variant="filled" miw="30%">
            {t`Close`}
          </Button>
        </Group>
      </Flex>
    </Stack>
  );
};
