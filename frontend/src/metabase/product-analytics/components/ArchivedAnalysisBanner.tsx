import {
  Api,
  useDeleteCardMutation,
  useUpdateCardMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { deletePermanently } from "metabase/archive/actions";
import { ArchivedEntityBanner } from "metabase/archive/components/ArchivedEntityBanner";
import type { CollectionPickerValueItem } from "metabase/common/components/Pickers/CollectionPicker";
import { useSetCollection } from "metabase/common/hooks";
import { useDispatch } from "metabase/redux";
import type { Card } from "metabase-types/api";

type ArchivedAnalysisBannerProps = {
  card: Card;
};

/**
 * The query builder's banner over a trashed question: restore it, move it
 * out of the trash, or delete it for good, which goes to the trash.
 */
export const ArchivedAnalysisBanner = ({
  card,
}: ArchivedAnalysisBannerProps) => {
  const dispatch = useDispatch();
  const [updateCard] = useUpdateCardMutation();
  const [deleteCard] = useDeleteCardMutation();
  const setCollection = useSetCollection();

  const handleMove = (collection: CollectionPickerValueItem) =>
    setCollection(
      { model: "card", id: card.id },
      collection.model === "dashboard"
        ? { model: "dashboard", id: collection.id }
        : {
            model: "collection",
            id: collection.id,
            // Moving to the trash should still trash it.
            type: collection.type === "trash" ? "trash" : undefined,
          },
    );

  // A trashed card drops out of the bookmarks; restoring brings it back.
  const handleUnarchive = async () => {
    await updateCard({ id: card.id, archived: false });
    dispatch(Api.util.invalidateTags([listTag("bookmark")]));
  };

  return (
    <ArchivedEntityBanner
      name={card.name}
      entityType={card.type}
      canMove={card.can_write}
      canRestore={card.can_restore}
      canDelete={card.can_delete}
      onUnarchive={handleUnarchive}
      onMove={handleMove}
      onDeletePermanently={() =>
        dispatch(deletePermanently(() => deleteCard(card.id).unwrap()))
      }
    />
  );
};
