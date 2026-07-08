import { useState } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { useDocsUrl, useUserSetting } from "metabase/common/hooks";
import {
  Button,
  Flex,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
  Title,
} from "metabase/ui";

import { ModelsVideo, ModelsVideoThumbnail } from "./EmptyStates";

export const ModelExplanationBanner = () => {
  const [hasDismissedBanner, setHasDismissedBanner] = useUserSetting(
    "dismissed-browse-models-banner",
  );

  const [opened, setOpened] = useState(false);

  const { showMetabaseLinks, url } = useDocsUrl("data-modeling/models");

  const dismissBanner = () => {
    setHasDismissedBanner(true);
  };

  if (hasDismissedBanner) {
    return null;
  }

  return (
    <Paper
      color="text-primary"
      bg="transparent"
      shadow="0"
      radius="0.25rem"
      role="complementary"
      w="80%"
      mb="xl"
    >
      <Flex>
        {showMetabaseLinks && (
          <ModelsVideoThumbnail onClick={() => setOpened(true)} />
        )}
        <Stack gap="md">
          <Title
            order={6}
            m={0}
          >{t`Create models to clean up and combine tables to make your data easier to explore`}</Title>
          <Text size="md" lh="1.5">
            {t`Models are somewhat like virtual tables: do all your joins and custom columns once, save it as a model, then query it like a table.`}
          </Text>
          <Group gap="md">
            {showMetabaseLinks && (
              <Button variant="subtle" p={0}>
                <ExternalLink href={url}>{t`Read the docs`}</ExternalLink>
              </Button>
            )}
            <Button variant="subtle" p={0} onClick={dismissBanner}>
              {t`Dismiss`}
            </Button>
          </Group>
        </Stack>
      </Flex>
      <Modal opened={opened} size="80%" onClose={() => setOpened(false)}>
        <ModelsVideo autoplay={1} />
      </Modal>
    </Paper>
  );
};
