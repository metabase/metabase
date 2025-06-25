import { useState } from "react";
import { t } from "ttag";

import { CodeEditor } from "metabase/common/components/CodeEditor";
import { useSetting } from "metabase/common/hooks";
import {
  Button,
  Card,
  CopyButton,
  Icon,
  Radio,
  Stack,
  Text,
} from "metabase/ui";

import { useSdkIframeEmbedSnippet } from "../hooks/use-sdk-iframe-embed-snippet";
import type { SdkIframeEmbedSetupAuthType } from "../types";

export const GetCodeStep = () => {
  const [authType, setAuthType] =
    useState<SdkIframeEmbedSetupAuthType>("user-session");

  const isJwtConfigured = useSetting("jwt-configured");
  const isSamlConfigured = useSetting("saml-configured");
  const isAnySsoConfigured = isJwtConfigured || isSamlConfigured;

  const snippet = useSdkIframeEmbedSnippet({ authType });

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
              setAuthType(value as SdkIframeEmbedSetupAuthType)
            }
          >
            <Stack gap="xs">
              <Radio value="user-session" label={t`User Session`} />

              <Radio
                value="sso"
                label={t`SSO Authentication`}
                disabled={!isAnySsoConfigured}
              />
            </Stack>
          </Radio.Group>

          {authType === "user-session" && (
            <Text size="sm" c="text-medium">
              {t`This option uses your existing user session and is only suitable for local development. In production, use SSO authentication with sandboxing to prevent unwanted access.`}
            </Text>
          )}

          {authType === "sso" && (
            <Text size="sm" c="text-medium">
              {t`SSO authentication is automatically configured. This is the recommended approach for production deployments.`}
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
                onClick={copy}
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
