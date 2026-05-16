import { useEffect, useRef, useState } from "react";
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

  const [loading, setLoading] = useState(false);
  const createPublicLinkRef = useRef(createPublicLink);

  useEffect(() => {
    createPublicLinkRef.current = createPublicLink;
  }, [createPublicLink]);

  useEffect(() => {
    let isMounted = true;

    if (!isOpen || url) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const createPublicLinkResult = createPublicLinkRef.current();
    if (createPublicLinkResult == null) {
      setLoading(false);
      return;
    }

    Promise.resolve(createPublicLinkResult).finally(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, url]);

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
          <Title c="text-secondary" order={4}>{t`Public link`}</Title>
          <Text
            color="text-secondary"
            size="sm"
            mb="xs"
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
