import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { Stack, Text, Title } from "metabase/ui";

type EmbeddingHubPlaceholderPageProps = {
  title: string;
  /** Where these settings live until the tab is built. */
  currentLocationLabel: string;
  currentLocationUrl: string;
};

export function EmbeddingHubPlaceholderPage({
  title,
  currentLocationLabel,
  currentLocationUrl,
}: EmbeddingHubPlaceholderPageProps) {
  return (
    <Stack mx="auto" py="xl" gap="md" maw={800}>
      <Title order={1} c="text-primary">
        {title}
      </Title>

      <Text c="text-secondary">
        {t`This tab is still being built.`}{" "}
        {t`Until it is, these settings live in ${currentLocationLabel}.`}
      </Text>

      <Link to={currentLocationUrl} variant="brand">
        {currentLocationLabel}
      </Link>
    </Stack>
  );
}
