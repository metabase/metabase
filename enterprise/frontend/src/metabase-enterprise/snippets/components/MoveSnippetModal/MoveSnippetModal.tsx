import { useState } from "react";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import { useSetCollection } from "metabase/common/hooks/use-set-collection";
import type { MoveSnippetModalProps } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

import { SnippetCollectionPickerModal } from "../SnippetCollectionPickerModal";

export function MoveSnippetModal({ snippet, onClose }: MoveSnippetModalProps) {
  const setCollection = useSetCollection();
  const [sendToast] = useToast();
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = async (collectionId: CollectionId | null) => {
    setIsMoving(true);

    try {
      await setCollection(
        { model: "snippet", id: snippet.id },
        { id: collectionId ?? "root" },
        { notify: false },
      );
      sendToast({
        message: t`Snippet moved`,
        icon: "check",
      });
      onClose();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to move snippet`),
        icon: "warning",
      });
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <SnippetCollectionPickerModal
      isOpen={!isMoving}
      onSelect={handleMove}
      onClose={onClose}
    />
  );
}
