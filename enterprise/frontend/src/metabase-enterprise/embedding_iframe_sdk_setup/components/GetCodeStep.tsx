import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { useSetting } from "metabase/common/hooks";
import {
  Button,
  Card,
  CopyButton,
  Flex,
  HoverCard,
  Icon,
  Radio,
  Stack,
  Text,
} from "metabase/ui";

import { trackEmbedWizardCodeCopied } from "../analytics";
import { useSdkIframeEmbedSetupContext } from "../context";
import { useSdkIframeEmbedSnippet } from "../hooks/use-sdk-iframe-embed-snippet";

export const GetCodeStep = () => {
  const { settings, updateSettings } = useSdkIframeEmbedSetupContext();

  const isJwtEnabled = useSetting("jwt-enabled");
  const isSamlEnabled = useSetting("saml-enabled");
  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");

  const isSsoEnabledAndConfigured =
    (isJwtEnabled && isJwtConfigured) || (isSamlEnabled && isSamlConfigured);

  const snippet = useSdkIframeEmbedSnippet();

  const authType = settings.useExistingUserSession ? "user-session" : "sso";

  return (
    <Stack gap="md">
      <Card p="md">
        <Stack gap="md" p="xs">
          <Text size="lg" fw="bold">
            {t`Authentication`}
          </Text>

          <Text size="sm" c="text-medium">
            {t`Choose the authentication method for embedding:`}
          </Text>

          <Radio.Group
            value={authType}
            onChange={(value) =>
              updateSettings({
                useExistingUserSession: value === "user-session",
              })
            }
          >
            <Stack gap="sm">
              <Radio
                value="user-session"
                label={
                  <Flex align="center" gap="xs">
                    {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                    <Text>{t`Existing Metabase session`}</Text>
                    <HoverCard position="bottom">
                      <HoverCard.Target>
                        <Icon
                          name="info"
                          size={14}
                          c="text-medium"
                          cursor="pointer"
                        />
                      </HoverCard.Target>
                      <HoverCard.Dropdown>
                        <Text size="sm" p="md" style={{ width: 300 }}>
                          {/* eslint-disable-next-line no-literal-metabase-strings -- this string is only shown for admins. */}
                          {t`This option lets you test Embedded Analytics JS locally using your existing Metabase session cookie. This only works for testing locally, using your admin account and on this browser. This may not work on Safari and Firefox. We recommend testing this in Chrome.`}
                        </Text>
                      </HoverCard.Dropdown>
                    </HoverCard>
                  </Flex>
                }
              />

              <Radio
                value="sso"
                label={t`Single sign-on (SSO)`}
                disabled={!isSsoEnabledAndConfigured}
              />
            </Stack>
          </Radio.Group>

          {authType === "sso" && (
            <Text size="sm" c="text-medium">
              {t`Select this option if you have already set up SSO. This option relies on SSO to sign in your application users into the embedded iframe, and groups and permissions to enforce limits on what users can access. `}
            </Text>
          )}
        </Stack>
      </Card>

      <Card p="md">
        <Text size="lg" fw="bold" mb="md">
          {t`Embed Code`}
        </Text>

        <Stack gap="sm">
          <CodeEditor
            language="html"
            value={snippet}
            readOnly
            lineNumbers={false}
          />

          <CopyButton value={snippet}>
            {({ copied, copy }: { copied: boolean; copy: () => void }) => (
              <Button
                leftSection={<Icon name="copy" size={16} />}
                onClick={() => {
                  copy();
                  trackEmbedWizardCodeCopied();
                }}
              >
                {copied ? t`Copied!` : t`Copy Code`}
              </Button>
            )}
          </CopyButton>
        </Stack>
      </Card>
    </Stack>
  );
};
