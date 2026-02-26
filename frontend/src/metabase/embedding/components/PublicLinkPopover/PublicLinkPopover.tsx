import { useState } from "react";
import { useAsync } from "react-use";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_PUBLIC_SHARING } from "metabase/plugins";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Button, Popover, Text, Title } from "metabase/ui";

import { PublicLinkCopyPanel } from "./PublicLinkCopyPanel";
import type { ExportFormatType } from "./types";

export type PublicLinkPopoverProps = {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: (expiresInMinutes?: number | null) => Promise<void>;
  deletePublicLink: () => void;
  url: string | null;
  extensions?: ExportFormatType[];
  selectedExtension?: ExportFormatType | null;
  setSelectedExtension?: (extension: ExportFormatType) => void;
  onCopyLink?: () => void;
  expiresAt?: string | null;
  expired?: boolean;
};

export const PublicLinkPopover = ({
  target,
  createPublicLink,
  deletePublicLink,
  url,
  isOpen,
  onClose,
  extensions = [],
  selectedExtension,
  setSelectedExtension,
  onCopyLink,
  expiresAt,
  expired,
}: PublicLinkPopoverProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasExpiryFeature = PLUGIN_PUBLIC_SHARING.isExpiringLinksEnabled();
  const [expiresInMinutes, setExpiresInMinutes] = useState<number | null>(null);

  // When expiry feature is enabled and no link exists yet, don't auto-create.
  // Instead, show a "Create link" button so user can set expiry first.
  const shouldAutoCreate = !hasExpiryFeature;

  const { loading } = useAsync(async () => {
    if (isOpen && !url && shouldAutoCreate) {
      return createPublicLink();
    }
    return null;
  }, [url, isOpen, shouldAutoCreate]);

  const [isCreating, setIsCreating] = useState(false);

  const handleCreateWithExpiry = async () => {
    setIsCreating(true);
    try {
      await createPublicLink(expiresInMinutes);
    } finally {
      setIsCreating(false);
    }
  };

  const onRemoveLink = () => {
    onClose();
    deletePublicLink();
  };

  const getMinDropdownHeight = () => {
    if (isAdmin || extensions.length > 0) {
      return "10rem";
    }

    return "auto";
  };

  const ExpiryOptionComponent = PLUGIN_PUBLIC_SHARING.ExpiryOptionComponent;
  const ExpiryDisplayComponent = PLUGIN_PUBLIC_SHARING.ExpiryDisplayComponent;

  const showPreCreationUI = hasExpiryFeature && !url && !loading && !isCreating;

  return (
    <Popover
      opened={isOpen}
      onChange={isOpen ? onClose : undefined}
      position="bottom-end"
    >
      <Popover.Target>
        <Box onClick={isOpen ? onClose : undefined}>{target}</Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Box
          p="lg"
          w="28rem"
          data-testid="public-link-popover-content"
          mih={getMinDropdownHeight()}
        >
          <Title c="text-secondary" order={4}>{t`Public link`}</Title>
          <Text
            color="text-secondary"
            size="sm"
            mb="xs"
          >{t`Anyone can view this if you give them the link.`}</Text>
          {showPreCreationUI ? (
            <Box>
              {ExpiryOptionComponent && (
                <ExpiryOptionComponent
                  expiresInMinutes={expiresInMinutes}
                  onChangeExpiresInMinutes={setExpiresInMinutes}
                />
              )}
              <Button
                mt="md"
                fullWidth
                onClick={handleCreateWithExpiry}
              >{t`Create public link`}</Button>
            </Box>
          ) : (
            <>
              <PublicLinkCopyPanel
                loading={loading || isCreating}
                url={url}
                onRemoveLink={isAdmin ? onRemoveLink : undefined}
                extensions={extensions}
                selectedExtension={selectedExtension}
                onChangeExtension={setSelectedExtension}
                removeButtonLabel={t`Remove public link`}
                removeTooltipLabel={t`Affects both public link and embed URL for this dashboard`}
                onCopy={onCopyLink}
              />
              {ExpiryDisplayComponent && url && (
                <ExpiryDisplayComponent
                  expiresAt={expiresAt ?? null}
                  expired={expired ?? false}
                />
              )}
            </>
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
