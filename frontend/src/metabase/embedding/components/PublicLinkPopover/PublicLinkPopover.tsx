import { useAsync } from "react-use";
import { t } from "ttag";

import type { ExportFormat } from "metabase/common/types/export";
import { PLUGIN_PUBLIC_LINK_PASSWORDS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Popover, Text } from "metabase/ui";

import { PublicLinkCopyPanel } from "./PublicLinkCopyPanel";

export type PublicLinkPopoverProps = {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => Promise<void>;
  deletePublicLink: () => void;
  url: string | null;
  entityType?: "card" | "dashboard";
  entityId?: number;
  extensions?: ExportFormat[];
  selectedExtension?: ExportFormat | null;
  setSelectedExtension?: (extension: ExportFormat | null) => void;
  onCopyLink?: () => void;
};

export const PublicLinkPopover = ({
  target,
  createPublicLink,
  deletePublicLink,
  url,
  isOpen,
  onClose,
  entityType,
  entityId,
  extensions = [],
  selectedExtension,
  setSelectedExtension,
  onCopyLink,
}: PublicLinkPopoverProps) => {
  const isAdmin = useSelector(getUserIsAdmin);
  const hasPasswordPlugin = PLUGIN_PUBLIC_LINK_PASSWORDS.isEnabled();

  const { loading } = useAsync(async () => {
    if (isOpen && !url) {
      return createPublicLink();
    }
    return null;
  }, [url, isOpen]);

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
          <Text size="md" fw={700} lh="1rem" mb="xs">{t`Public link`}</Text>
          <Text
            color="text-secondary"
            size="sm"
            mb="xs"
          >{t`Anyone can view this if you give them the link.`}</Text>
          <PublicLinkCopyPanel
            loading={loading}
            url={url}
            onRemoveLink={
              hasPasswordPlugin ? undefined : isAdmin ? onRemoveLink : undefined
            }
            extensions={extensions}
            selectedExtension={selectedExtension}
            onChangeExtension={setSelectedExtension}
            removeButtonLabel={t`Remove public link`}
            removeTooltipLabel={t`Affects both public link and embed URL for this dashboard`}
            onCopy={onCopyLink}
          />
          {hasPasswordPlugin && entityType && entityId && url && (
            <PLUGIN_PUBLIC_LINK_PASSWORDS.PasswordSection
              entityType={entityType}
              entityId={entityId}
              onRemoveLink={isAdmin ? onRemoveLink : undefined}
            />
          )}
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
