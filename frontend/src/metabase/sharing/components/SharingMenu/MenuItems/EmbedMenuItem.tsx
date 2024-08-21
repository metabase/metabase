import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Menu, Center, Icon, Title, Stack, Text } from "metabase/ui";

export function EmbedMenuItem({ onClick }: { onClick: () => void }) {
  const isEmbeddingEnabled = useSetting("enable-embedding");
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
    return null;
  }

  // TODO: prompt to save before embedding

  return (
    <Menu.Item
      data-testid="embed-menu-embed-modal-item"
      py="sm"
      icon={
        <Center mr="xs">
          <Icon name="embed" />
        </Center>
      }
      onClick={isEmbeddingEnabled ? onClick : undefined}
    >
      {isEmbeddingEnabled ? (
        <Title order={4}>{t`Embed`}</Title>
      ) : (
        <Link to="/admin/settings/embedding-in-other-applications">
          <Stack spacing="xs">
            <Title order={4}>{t`Embedding is off`}</Title>
            <Text size="sm">{t`Enable it in settings`}</Text>
          </Stack>
        </Link>
      )}
    </Menu.Item>
  );
}
