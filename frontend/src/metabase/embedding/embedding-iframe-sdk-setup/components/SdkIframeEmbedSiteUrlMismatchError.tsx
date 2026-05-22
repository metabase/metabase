import { jt, t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Anchor, Card, Code, Flex, Icon, Stack, Text } from "metabase/ui";

interface SdkIframeEmbedSiteUrlMismatchErrorProps {
  siteUrl: string;
}

export const SdkIframeEmbedSiteUrlMismatchError = ({
  siteUrl,
}: SdkIframeEmbedSiteUrlMismatchErrorProps) => {
  const applicationName = useSelector(getApplicationName);

  const siteUrlSettingLink = (
    <Anchor key="link" href="/admin/settings/general" target="_blank">
      {t`Site URL`}
    </Anchor>
  );

  return (
    <Card h="100%" data-testid="sdk-iframe-embed-site-url-mismatch-error">
      <Flex
        h="100%"
        align="center"
        justify="center"
        direction="column"
        gap="md"
        maw={520}
        mx="auto"
        p="xl"
      >
        <Icon name="warning" size={48} c="warning" />

        <Text fw="bold" size="lg" ta="center">
          {t`The preview can't load because the Site URL doesn't match the host you're using.`}
        </Text>

        <Stack gap="xs" align="center">
          <Text ta="center" c="text-secondary">
            {jt`Configured: ${<Code key="configured">{siteUrl}</Code>}`}
          </Text>
          <Text ta="center" c="text-secondary">
            {jt`Current: ${<Code key="current">{window.location.origin}</Code>}`}
          </Text>
        </Stack>

        <Text ta="center">
          {jt`Update the ${siteUrlSettingLink} setting to match the host you're using to access ${applicationName}, or open ${applicationName} via the configured Site URL.`}
        </Text>
      </Flex>
    </Card>
  );
};
