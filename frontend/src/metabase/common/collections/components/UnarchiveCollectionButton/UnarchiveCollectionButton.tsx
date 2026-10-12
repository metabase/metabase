import { match } from "ts-pattern";
import { t } from "ttag";

import { useUpdateCollectionMutation } from "metabase/api";
import { useInvalidateCollectionItems } from "metabase/common/collections/hooks";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { ActionIcon, FixedSizeIcon, Tooltip } from "metabase/ui";
import type { Collection } from "metabase-types/api";

type UnarchiveCollectionButtonProps = {
  collection: Collection;
};

export function UnarchiveCollectionButton({
  collection,
}: UnarchiveCollectionButtonProps) {
  const dispatch = useDispatch();
  const [updateCollection] = useUpdateCollectionMutation();
  const invalidateCollectionItems = useInvalidateCollectionItems();
  const remoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const handleUnarchive = async () => {
    try {
      await updateCollection({ id: collection.id, archived: false }).unwrap();
      void dispatch(
        addUndo({
          message: t`"${collection.name}" has been unarchived`,
          action: async () => {
            const { error } = await updateCollection({
              id: collection.id,
              archived: true,
            });
            if (error) {
              void dispatch(
                addUndo({
                  message: t`"${collection.name}" could not be archived`,
                  icon: "warning",
                }),
              );
            } else {
              invalidateCollectionItems(collection);
            }
          },
        }),
      );
      invalidateCollectionItems(collection);
    } catch (error) {
      void dispatch(
        addUndo({
          message: t`"${collection.name}" could not be unarchived`,
          icon: "warning",
        }),
      );
    }
  };

  if (!collection.can_write || remoteSyncReadOnly) {
    return null;
  }

  const label = match(collection.namespace)
    .with("snippets", () => t`Unarchive snippet folder`)
    .with("data-actions", () => t`Unarchive folder`)
    .otherwise(() => t`Unarchive collection`);

  return (
    <Tooltip label={label}>
      <ActionIcon
        aria-label={label}
        size="md"
        onClick={(event) => {
          event.stopPropagation();
          void handleUnarchive();
        }}
      >
        <FixedSizeIcon name="unarchive" c="text-primary" />
      </ActionIcon>
    </Tooltip>
  );
}
