import { useAsync } from "react-use";
import { t } from "ttag";

import {
  useCreateDocumentPublicLinkMutation,
  useDeleteDocumentPublicLinkMutation,
} from "metabase/api";
import { publicDocument as getPublicDocumentUrl } from "metabase/lib/urls/documents";
import {
  trackPublicEmbedCodeCopied,
  trackPublicLinkCopied,
  trackPublicLinkRemoved,
} from "metabase/public/lib/analytics";
import { Box, Popover, Title } from "metabase/ui";
import type { Document } from "metabase-types/api";

import { DocumentPublicLinkPopoverContent } from "./DocumentPublicLinkPopoverContent";

export const DocumentPublicLinkPopover = ({
  document,
  isOpen,
  onClose,
}: {
  document: Document;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const uuid = document.public_uuid;

  const url = uuid ? getPublicDocumentUrl(uuid) : null;

  const [createPublicDocumentLink] = useCreateDocumentPublicLinkMutation();
  const [deletePublicDocumentLink] = useDeleteDocumentPublicLinkMutation();

  const { loading } = useAsync(async () => {
    if (isOpen && !url) {
      return createPublicDocumentLink({
        id: document.id,
      });
    }
    return null;
  }, [url, isOpen]);

  const handleDeletePublicDocumentLink = () => {
    trackPublicLinkRemoved({
      artifact: "document",
      source: "public-share",
    });
    deletePublicDocumentLink({
      id: document.id,
    });
    onClose();
  };

  const onCopyLink = () => {
    trackPublicLinkCopied({
      artifact: "document",
    });
  };

  const onCopyEmbed = () => {
    trackPublicEmbedCodeCopied({
      artifact: "document",
      source: "public-share",
    });
  };

  return (
    <Popover
      opened={isOpen}
      onChange={isOpen ? onClose : undefined}
      position="bottom-end"
    >
      <Popover.Target>
        <Box onClick={isOpen ? onClose : undefined}>
          <span />
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <Box
          p="lg"
          w="32rem"
          data-testid="public-link-popover-content"
          mih="10rem"
        >
          <Title
            c="text-secondary"
            order={4}
            mb="md"
          >{t`Public sharing`}</Title>
          <DocumentPublicLinkPopoverContent
            url={url}
            loading={loading}
            onRemoveLink={handleDeletePublicDocumentLink}
            onCopyLink={onCopyLink}
            onCopyEmbed={onCopyEmbed}
          />
        </Box>
      </Popover.Dropdown>
    </Popover>
  );
};
