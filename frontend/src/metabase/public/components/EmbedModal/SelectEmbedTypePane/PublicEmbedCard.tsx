import { useState } from "react";
import { useAsync } from "react-use";
import { jt, t } from "ttag";

import { trackPublicEmbedCodeCopied } from "metabase/public/lib/analytics";
import { PublicLinkCopyPanel } from "metabase/sharing/components/PublicLinkPopover/PublicLinkCopyPanel";
import {
  Button,
  Center,
  Group,
  Loader,
  Popover,
  Stack,
  Text,
} from "metabase/ui";

export const PublicEmbedCard = ({
  publicEmbedCode,
  createPublicLink,
  deletePublicLink,
  resourceType,
}: any) => {
  const [isOpen, setIsOpen] = useState(false);

  const { loading } = useAsync(async () => {
    if (isOpen && !publicEmbedCode) {
      return createPublicLink();
    }
    return null;
  }, [publicEmbedCode, isOpen]);

  return (
    <Group spacing="xs">
      <Text>
        {jt`Use ${(
          <Text span fw="bold" key="bold">
            {t`public embedding`}
          </Text>
        )} to add a publicly-visible iframe embed to your web page or blog
    post.`}
      </Text>
      <Popover
        width={200}
        position="bottom"
        withArrow
        shadow="md"
        opened={isOpen}
        // onClose is still needed to close the popover when the user clicks outside of it
        // even if it we're using Popover as controlled
        onClose={() => setIsOpen(false)}
      >
        <Popover.Target>
          <Button
            variant="subtle"
            p={0}
            onClick={() => setIsOpen(value => !value)}
          >{t`Get embedding code`}</Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack p="lg" w="28rem" mih="7.5rem" justify="center">
            {loading ? (
              <Center>
                <Loader />
              </Center>
            ) : (
              <PublicLinkCopyPanel
                url={publicEmbedCode}
                onRemoveLink={e => {
                  setIsOpen(false);
                  deletePublicLink(e);
                }}
                removeButtonLabel={t`Remove public link`}
                removeTooltipLabel={t`Affects both public link and embed URL for this dashboard`}
                onCopy={() =>
                  trackPublicEmbedCodeCopied({
                    artifact: resourceType,
                    source: "public-embed",
                  })
                }
              />
            )}
          </Stack>
        </Popover.Dropdown>
      </Popover>
    </Group>
  );
};
