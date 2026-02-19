import { useState } from "react";
import { t } from "ttag";

import { CopyButton } from "metabase/common/components/CopyButton";
import { useSelector } from "metabase/lib/redux";
import { getPublicEmbedHTMLWithResizer } from "metabase/public/lib/code-templates";
import { getUserIsAdmin } from "metabase/selectors/user";
import {
  Anchor,
  Box,
  Code,
  Group,
  ScrollArea,
  Stack,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

import S from "./DocumentPublicLinkPopoverContent.module.css";

interface DocumentPublicLinkPopoverContentProps {
  url: string | null;
  loading?: boolean;
  onRemoveLink?: () => void;
  onCopyLink?: () => void;
  onCopyEmbed?: () => void;
}

export const DocumentPublicLinkPopoverContent = ({
  url,
  loading = false,
  onRemoveLink,
  onCopyLink,
  onCopyEmbed,
}: DocumentPublicLinkPopoverContentProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const [activeTab, setActiveTab] = useState<string | null>("link");

  const iframeCode = url
    ? getPublicEmbedHTMLWithResizer(JSON.stringify(url))
    : "";

  return (
    <Stack gap="md">
      <Box>
        <Text size="sm" c="text-secondary" mb="xs">
          {t`Anyone can view this if you give them the link or embed it.`}
        </Text>
      </Box>

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="link">{t`Public link`}</Tabs.Tab>
          <Tabs.Tab value="embed">{t`Embed code`}</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="link" pt="md">
          <Stack gap="sm">
            <TextInput
              readOnly
              data-testid="public-link-input"
              placeholder={loading ? t`Loading…` : undefined}
              value={url ?? undefined}
              rightSection={
                url && (
                  <CopyButton
                    value={url}
                    onCopy={onCopyLink}
                    aria-label={t`Copy link`}
                  />
                )
              }
            />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="embed" pt="md">
          <Stack gap="sm">
            <Box>
              <Text size="sm" c="text-secondary" mb="xs">
                {t`Paste this code in your website or blog to embed the document. The iframe will automatically adjust to the document's height.`}
              </Text>
            </Box>
            <Box className={S.embedCodeContainer}>
              <ScrollArea
                mah={200}
                type="auto"
                offsetScrollbars
                styles={{
                  viewport: {
                    "& > div": {
                      display: "block !important",
                    },
                  },
                }}
              >
                <Code block className={S.embedCode}>
                  {iframeCode}
                </Code>
              </ScrollArea>
              <Box className={S.copyButtonContainer}>
                {iframeCode && (
                  <CopyButton
                    value={iframeCode}
                    onCopy={onCopyEmbed}
                    aria-label={t`Copy embed code`}
                  />
                )}
              </Box>
            </Box>
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {isAdmin && onRemoveLink && (
        <Group justify="flex-start" mt="sm">
          <Tooltip
            label={
              <Text fw={700} c="inherit">
                {t`Affects both public link and embed code for this document`}
              </Text>
            }
          >
            <Anchor
              component="button"
              fz="sm"
              c="error"
              fw={700}
              onClick={onRemoveLink}
              className={S.removeLinkAnchor}
            >
              {t`Remove public link`}
            </Anchor>
          </Tooltip>
        </Group>
      )}
    </Stack>
  );
};
