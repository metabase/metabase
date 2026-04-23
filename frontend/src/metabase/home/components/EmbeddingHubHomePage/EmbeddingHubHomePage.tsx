import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { t } from "ttag";

import { EmbeddingHub } from "metabase/embedding/embedding-hub";
import { ActionIcon, Group, Icon, Menu, Stack, Text } from "metabase/ui";
import { useDispatch } from "metabase/utils/redux";

import { CustomHomePageModal } from "../CustomHomePageModal";
import { dismissEmbeddingHomepage } from "../EmbedHomepage/actions";
import { MetabotGreeting } from "../HomeGreeting";

/**
 * Embedding Hub shown in the embedding home page for admins in EE instances.
 */
export const EmbeddingHubHomePage = (): ReactNode => {
  const [
    isCustomHomePageModalOpened,
    { open: openCustomHomePageModal, close: closeCustomHomePageModal },
  ] = useDisclosure(false);

  const dispatch = useDispatch();

  const handleDismissGuide = () =>
    dispatch(dismissEmbeddingHomepage("dismissed-done"));

  return (
    <Stack mx="auto" p="xl" maw={850}>
      <Group gap="sm" justify="space-between" mb="xl">
        <Group gap="sm">
          <MetabotGreeting />

          <Text fw={700} fz="lg">{t`Get started with modular embedding`}</Text>
        </Group>

        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={t`More options`}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={openCustomHomePageModal}
            >
              {t`Customize homepage`}
            </Menu.Item>

            <Menu.Item
              leftSection={<Icon name="close" />}
              onClick={handleDismissGuide}
            >
              {t`Dismiss guide`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <EmbeddingHub />

      <CustomHomePageModal
        isOpen={isCustomHomePageModalOpened}
        onClose={closeCustomHomePageModal}
      />
    </Stack>
  );
};
