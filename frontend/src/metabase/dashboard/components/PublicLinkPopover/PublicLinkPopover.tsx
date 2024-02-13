import { useAsync } from "react-use";
import { t } from "ttag";
import type { ExportFormatType } from "metabase/dashboard/components/PublicLinkPopover/types";
import { PublicLinkCopyPanel } from "metabase/dashboard/components/PublicLinkPopover/PublicLinkCopyPanel";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Box, Popover, Text, Title } from "metabase/ui";

export type PublicLinkPopoverProps = {
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
  createPublicLink: () => Promise<void>;
  deletePublicLink: () => void;
  url: string | null;
  extensions?: ExportFormatType[];
  selectedExtension?: ExportFormatType | null;
  setSelectedExtension?: (extension: ExportFormatType) => void;
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

  const getMinDropdownHeight = () => {
    if (isAdmin || extensions.length > 0) {
      return "10rem";
    }

    return "auto";
  };

  return (
    <Popover opened={isOpen} onClose={onClose} withinPortal>
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
          <Title order={4}>{t`Public link`}</Title>
          <Text>{t`Anyone can view this if you give them the link.`}</Text>
          <PublicLinkCopyPanel
            loading={loading}
            url={url}
            onRemoveLink={isAdmin ? onRemoveLink : undefined}
            extensions={extensions}
            selectedExtension={selectedExtension}
            onChangeExtension={setSelectedExtension}
            removeButtonLabel={t`Remove public link`}
            removeTooltipLabel={t`Affects both public link and embed URL for this dashboard`}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
