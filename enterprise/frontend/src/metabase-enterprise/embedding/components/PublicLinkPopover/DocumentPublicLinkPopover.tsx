import { PublicLinkPopover } from "metabase/embedding/components/PublicLinkPopover/PublicLinkPopover";
import { publicDocument as getPublicDocumentUrl } from "metabase/lib/urls/documents";
import {
  trackPublicLinkCopied,
  trackPublicLinkRemoved,
} from "metabase/public/lib/analytics";
import {
  useCreateDocumentPublicLinkMutation,
  useDeleteDocumentPublicLinkMutation,
} from "metabase-enterprise/api";
import type { Document } from "metabase-types/api";

export const DocumentPublicLinkPopover = ({
  document,
  target,
  isOpen,
  onClose,
}: {
  document: Document;
  target: JSX.Element;
  isOpen: boolean;
  onClose: () => void;
}) => {
  const uuid = document.public_uuid;

  const url = uuid ? getPublicDocumentUrl(uuid) : null;

  const [createPublicDocumentLink] = useCreateDocumentPublicLinkMutation();
  const [deletePublicDocumentLink] = useDeleteDocumentPublicLinkMutation();

  const handleCreatePublicDocumentLink = async () => {
    await createPublicDocumentLink({
      id: document.id,
    });
  };
  const handleDeletePublicDocumentLink = () => {
    trackPublicLinkRemoved({
      artifact: "document",
      source: "public-share",
    });
    deletePublicDocumentLink({
      id: document.id,
    });
  };

  const onCopyLink = () => {
    trackPublicLinkCopied({
      artifact: "document",
    });
  };

  return (
    <PublicLinkPopover
      target={target}
      isOpen={isOpen}
      onClose={onClose}
      createPublicLink={handleCreatePublicDocumentLink}
      deletePublicLink={handleDeletePublicDocumentLink}
      url={url}
      onCopyLink={onCopyLink}
    />
  );
};
