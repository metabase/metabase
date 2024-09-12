import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Center, Icon, Menu, Stack, Text, Title } from "metabase/ui";

export function EmbedMenuItem({ onClick }: { onClick: () => void }) {
  // TODO: Change this to `enable-embedding-static` once the BE is implemented.
  const isStaticEmbeddingEnabled = useSetting("enable-embedding");
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
    return null;
  }

  return (
    <Menu.Item
      data-testid="embed-menu-embed-modal-item"
      py="sm"
      icon={
        <Center mr="xs">
          <Icon name="embed" />
        </Center>
      }
      onClick={isStaticEmbeddingEnabled ? onClick : undefined}
    >
      {isStaticEmbeddingEnabled ? (
        <Title order={4}>{t`Embed`}</Title>
      ) : (
        <Link
          to="/admin/settings/embedding-in-other-applications"
          target="_blank"
        >
          <Stack spacing="xs">
            <Title order={4}>{t`Embedding is off`}</Title>
            <Text size="sm">{t`Enable it in settings`}</Text>
          </Stack>
        </Link>
      )}
    </Menu.Item>
  );
}
