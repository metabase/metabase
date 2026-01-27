import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import { Button, Flex, Group, Icon, Stack, Text } from "metabase/ui";

export const DatabaseReplicationError = ({
  error,
  onClose,
}: {
  error?: string;
  onClose: () => void;
}) => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  return (
    <Stack gap="xl" mt="xl">
      <Text c="text-secondary" fz="md" lh="1.25rem">
        {error || "Unknown error"}
      </Text>

      <Flex justify="end">
        <Group align="center">
          {showMetabaseLinks && (
            <Button
              component={ExternalLink}
              variant="outline"
              rightSection={<Icon name="external" />}
              size="md"
              role="link"
              href="https://www.metabase.com/docs/latest/"
            >
              {t`Read the docs`}
            </Button>
          )}

          <Button variant="filled" size="md" onClick={onClose}>
            {t`Close`}
          </Button>
        </Group>
      </Flex>
    </Stack>
  );
};
