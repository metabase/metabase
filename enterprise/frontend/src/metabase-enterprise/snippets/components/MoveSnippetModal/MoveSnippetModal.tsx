import { useState } from "react";
import { t } from "ttag";

import { useUpdateSnippetMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useToast } from "metabase/common/hooks";
import type { MoveSnippetModalProps } from "metabase/plugins";
import type { CollectionId } from "metabase-types/api";

import { SnippetCollectionPickerModal } from "../SnippetCollectionPickerModal";

export function MoveSnippetModal({ snippet, onClose }: MoveSnippetModalProps) {
  const [updateSnippet] = useUpdateSnippetMutation();
  const [sendToast] = useToast();
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = async (collectionId: CollectionId | null) => {
    setIsMoving(true);

    const { error } = await updateSnippet({
      id: snippet.id,
      collection_id: collectionId,
    });

    if (error) {
      sendToast({
        message: getErrorMessage(error, t`Failed to move snippet`),
        icon: "warning",
      });
    } else {
      sendToast({
        message: t`Snippet moved`,
        icon: "check",
      });
      onClose();
    }

    setIsMoving(false);
  };

  return (
    <SnippetCollectionPickerModal
      isOpen={!isMoving}
      onSelect={handleMove}
      onClose={onClose}
    />
  );
}
