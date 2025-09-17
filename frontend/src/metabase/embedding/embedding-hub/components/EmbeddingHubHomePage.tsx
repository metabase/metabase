import type { ReactNode } from "react";
import { useState } from "react";
import { t } from "ttag";

import { CustomHomePageModal } from "metabase/home/components/CustomHomePageModal";
import { dismissEmbeddingHomepage } from "metabase/home/components/EmbedHomepage/actions";
import { MetabotGreeting } from "metabase/home/components/HomeGreeting";
import { useDispatch } from "metabase/lib/redux";
import { ActionIcon, Group, Icon, Menu, Stack, Text } from "metabase/ui";

import { EmbeddingHub } from "./EmbeddingHub";

/**
 * Embedding Hub shown in the embedding home page for admins in EE instances.
 */
export const EmbeddingHubHomePage = (): ReactNode => {
  const [showCustomHomePageModal, setShowCustomHomePageModal] = useState(false);
  const dispatch = useDispatch();

  const handleDismissGuide = () =>
    dispatch(dismissEmbeddingHomepage("dismissed-done"));

  return (
    <Stack mx="auto" py="xl" maw={800}>
      <Group gap="sm" justify="space-between" mb="xl">
        <Group gap="sm">
          <MetabotGreeting />

          <Text
            fw={700}
            fz="lg"
          >{t`Get started with Embedded Analytics JS`}</Text>
        </Group>

        <Menu>
          <Menu.Target>
            <ActionIcon variant="subtle" aria-label={t`More options`}>
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>

          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Icon name="pencil" />}
              onClick={() => setShowCustomHomePageModal(true)}
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
        isOpen={showCustomHomePageModal}
        onClose={() => setShowCustomHomePageModal(false)}
      />
    </Stack>
  );
};
