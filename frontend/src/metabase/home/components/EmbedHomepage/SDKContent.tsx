import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Button, Group, Text } from "metabase/ui";

import { Badge } from "./Badge";

type SDKContentProps = {
  sdkQuickstartUrl: string;
  sdkDocsUrl: string;
};

export const SDKContent = ({
  sdkQuickstartUrl,
  sdkDocsUrl,
}: SDKContentProps) => (
  <Box>
    <Group gap="sm" align="center" mb="sm">
      <Text fw="bold" size="lg" color="text-medium">
        {t`Embedded analytics SDK`}
      </Text>
      <Badge
        color="gray"
        fz="sm"
        px="sm"
        py="xs"
        uppercase={false}
      >{t`Beta`}</Badge>
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
