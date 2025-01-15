import { useState } from "react";
import { t } from "ttag";

import { useDocsUrl, useUserSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
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
      color="text-dark"
      bg="transparent"
      shadow="0"
      radius="0.25rem"
      role="complementary"
      w="80%"
      mb="xl"
    >
      <Flex>
        <div
          onClick={() => setOpened(true)}
          style={{
            cursor: "pointer",
            background: "pink",
            width: "120px",
            height: "80px",
            marginRight: "16px",
          }}
        />
        <Stack spacing="md">
          <Title
            order={2}
            size="md"
            lh={1}
            m={0}
          >{t`Create models to clean up and combine tables to make your data easier to explore`}</Title>
          <Text size="md" lh="1.5">
            {t`Models are somewhat like virtual tables: do all your joins and custom columns once, save it as a model, then query it like a table.`}
          </Text>
          <Group spacing="md">
            {showMetabaseLinks && (
              <Button variant="subtle" p={0}>
                <ExternalLink
                  key="model-caching-link"
                  href={url}
                >{t`Read the docs`}</ExternalLink>
              </Button>
            )}
            <Button variant="subtle" p={0} onClick={dismissBanner}>
              Dismiss
            </Button>
          </Group>
        </Stack>
      </Flex>
      <Modal opened={opened} size="80%" onClose={() => setOpened(false)}>
        <iframe
          width="100%"
          style={{ aspectRatio: "16/9", border: 0, borderRadius: "8px" }}
          src="https://www.youtube.com/embed/Cb7-wLAgSCA?si=gPukXurSJAM8asGJ&autoplay=1"
          // eslint-disable-next-line no-literal-metabase-strings -- It's just a title for the a11y purposes
          title="Use Models in Metabase | Getting started with Metabase"
          referrerPolicy="strict-origin-when-cross-origin"
        ></iframe>
      </Modal>
    </Paper>
  );
};
