import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Button, Group, Text } from "metabase/ui";

type InteractiveContentProps = {
  interactiveEmbeddingQuickstartUrl: string;
  learnMoreInteractiveEmbedUrl: string;
};

export const InteractiveContent = ({
  interactiveEmbeddingQuickstartUrl,
  learnMoreInteractiveEmbedUrl,
}: InteractiveContentProps) => (
  <Box>
    <Text
      fw="bold"
      mb="sm"
      size="lg"
      color="text-medium"
    >{t`Interactive embedding`}</Text>
    <Text mb="md">
      {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
      {t`Interactive embedding allows you to embed the full Metabase app with iframes. It offers settings to customize appearance and includes the query builder with row-level access.`}
    </Text>
    <Group gap="md">
      <ExternalLink href={interactiveEmbeddingQuickstartUrl}>
        <Button variant="outline">{t`Check out the Quickstart`}</Button>
      </ExternalLink>
      <ExternalLink href={learnMoreInteractiveEmbedUrl}>
        <Button variant="subtle">{t`Read the docs`}</Button>
      </ExternalLink>
    </Group>
  </Box>
);
