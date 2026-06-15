import { useAsync } from "react-use";
import { t } from "ttag";

import type { ExportFormat } from "metabase/common/types/export";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Popover, Text, Title } from "metabase/ui";

import { PublicLinkCopyPanel } from "./PublicLinkCopyPanel";

export type PublicLinkPopoverProps = {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => Promise<void>;
  deletePublicLink: () => void;
  url: string | null;
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
  extensions = [],
  selectedExtension,
  setSelectedExtension,
  onCopyLink,
}: PublicLinkPopoverProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

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
        <Box p="lg" w="28rem" data-testid="public-link-popover-content">
          <Title
            order={4}
            c="text-primary"
            fz="md"
            fw={700}
            lh="1.5rem"
          >{t`Public link`}</Title>
          <Text
            color="text-secondary"
            size="sm"
            mb="sm"
          >{t`Anyone can view this if you give them the link.`}</Text>
          <PublicLinkCopyPanel
            loading={loading}
            url={url}
            onRemoveLink={isAdmin ? onRemoveLink : undefined}
            extensions={extensions}
            selectedExtension={selectedExtension}
            onChangeExtension={setSelectedExtension}
            removeButtonLabel={t`Remove public link`}
            removeTooltipLabel={t`Affects both public link and embed URL for this dashboard`}
            onCopy={onCopyLink}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
