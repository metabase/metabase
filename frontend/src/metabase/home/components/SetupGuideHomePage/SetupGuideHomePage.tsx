import { useDisclosure } from "@mantine/hooks";
import type { ReactNode } from "react";
import { t } from "ttag";

import { SetupGuide } from "metabase/embedding/setup-guide";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Group, Icon, Menu, Stack, Text } from "metabase/ui";

import { CustomHomePageModal } from "../CustomHomePageModal";
import { dismissEmbeddingHomepage } from "../EmbedHomepage/actions";
import { MetabotGreeting } from "../HomeGreeting";

/**
 * Setup guide shown in the embedding home page for admins in EE instances.
 */
export const SetupGuideHomePage = (): ReactNode => {
  const [
    isCustomHomePageModalOpened,
    { open: openCustomHomePageModal, close: closeCustomHomePageModal },
  ] = useDisclosure(false);

  const dispatch = useDispatch();

  const handleDismissGuide = () =>
    dispatch(dismissEmbeddingHomepage("dismissed-done"));

  return (
    <Stack mx="auto" p="xxl" maw={850}>
      <Group gap="sm" justify="space-between" mb="xxl">
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

      <SetupGuide returnTo="/" />

      <CustomHomePageModal
        isOpen={isCustomHomePageModalOpened}
        onClose={closeCustomHomePageModal}
      />
    </Stack>
  );
};
