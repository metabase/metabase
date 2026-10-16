import { t } from "ttag";

import { useGetDocumentCardsQuery } from "metabase/api";
import { useSetArchive } from "metabase/archive/hooks";
import { ArchiveModal } from "metabase/common/components/ArchiveModal";
import { getTrashDocumentMessage } from "metabase/documents/utils/trash";
import type { Document } from "metabase-types/api";
import { isReadableCard } from "metabase-types/guards/card";

type ArchiveDocumentModalProps = {
  document: Pick<Document, "id">;
  onClose: () => void;
};

export function ArchiveDocumentModal({
  document,
  onClose,
}: ArchiveDocumentModalProps) {
  const archive = useSetArchive();
  const { data: response, isLoading } = useGetDocumentCardsQuery({
    id: document.id,
  });
  const hasDocumentQuestions =
    response?.cards.some(
      (card) => isReadableCard(card) && card.document_id === document.id,
    ) ?? false;
  const message = hasDocumentQuestions
    ? getTrashDocumentMessage(1)
    : t`Are you sure you want to do this?`;

  return (
    <ArchiveModal
      title={t`Move this document to trash?`}
      model="document"
      modelId={document.id}
      isLoading={isLoading}
      message={isLoading ? undefined : message}
      onArchive={() => archive({ model: "document", id: document.id }, true)}
      onClose={onClose}
    />
  );
}
