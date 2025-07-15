import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import { Anchor, Box, Button, Icon, Stack, Text, Title } from "metabase/ui";

export const DoneStep = () => {
  const { url: authUrl } = useDocsUrl(
    "embedding/interactive-embedding-quick-start-guide",
  );
  const { url: appearanceUrl } = useDocsUrl("configuring-metabase/appearance");
  const { url: contentUrl } = useDocsUrl("dashboards/introduction");

  return (
    <Box>
      <Box mb="4rem">
        <Title order={2} fw="bold" mb="md">
          {t`You're on your way!`}
        </Title>
        <Text>
          {t`Now that you have a toy app with some starter content, you’re set up to go further.`}
        </Text>
      </Box>
      <Stack gap="3rem" mb="4rem">
        <ExternalLinkBlock
          href={authUrl}
          text={t`Next: Set up SSO`}
          description={t`Learn more about how to set up the right auth strategy so your users only see the data they’re supposed to.`}
        />
        <ExternalLinkBlock
          href={appearanceUrl}
          text={t`Later: Explore Theming`}
          description={t`Make your embeds match your apps look and feel.`}
        />
        <ExternalLinkBlock
          href={contentUrl}
          text={t`Later: Creating content for your embeds`}
          description={t`Evolve these starter dashboards or create new analysis.`}
        />
      </Stack>
      {/* This needs to be a client side navigation for a couple of reasons:
      - when we'll have the token step, we'll need to refresh the page to load the updated plugins
      - in /setup/embedding we're skipping rendering the DatabaseStatus component, but as soon as the user lands on /
      that will get rendered and shown, because we'll need the browser navigation anyway, this is a "cheap" solution to that as well */}
      <Button component="a" href="/" variant="filled">
        {t`Take me to Metabase`}
      </Button>
    </Box>
  );
};

const ExternalLinkBlock = ({
  href,
  text,
  description,
}: {
  href: string;
  text: string;
  description: string;
}) => {
  return (
    <Box>
      <Anchor
        href={href}
        target="_blank"
        rel="noopener"
        c="brand"
        fw="bold"
        size="xl"
        mb="sm"
      >
        {text}
        <Icon name="external" ml="sm" color="var(--mb-color-text-dark)" />
      </Anchor>
      <Text mt="xs" c="text-primary">
        {description}
      </Text>
    </Box>
  );
};
