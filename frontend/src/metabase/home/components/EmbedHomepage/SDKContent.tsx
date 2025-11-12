import { t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { Box, Button, Group, Text } from "metabase/ui";

type SDKContentProps = {
  sdkQuickstartUrl: string;
  sdkDocsUrl: string;
};

export const SDKContent = ({
  sdkQuickstartUrl,
  sdkDocsUrl,
}: SDKContentProps) => (
  <Box component="section" aria-labelledby="sdk-title">
    <Group gap="sm" align="center" mb="sm">
      <Text fw="bold" size="lg" color="text-secondary" id="sdk-title">
        {t`Embedded analytics SDK for React`}
      </Text>
    </Group>
    <Text mb="md">
      {t`Embed individual components like charts, dashboards, the query builder, and more with React. Get advanced customization with CSS styling and manage granular access and interactivity per component.`}
    </Text>
    <Group gap="md">
      <ExternalLink href={sdkQuickstartUrl}>
        <Button variant="outline">{t`Check out the Quickstart`}</Button>
      </ExternalLink>
      <ExternalLink href={sdkDocsUrl}>
        <Button variant="subtle">{t`Read the docs`}</Button>
      </ExternalLink>
    </Group>
  </Box>
);
