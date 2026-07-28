import { useCallback, useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { useSetArchive } from "metabase/archive/hooks";
import {
  BulkActionBar,
  BulkActionButton,
  BulkActionDangerButton,
} from "metabase/common/components/BulkActionBar";
import {
  CollectionPickerModal,
  type OmniPickerItem,
} from "metabase/common/components/Pickers";
import { useConfirmation, useSetCollection } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import type { CollectionId, RegularCollectionId } from "metabase-types/api";

import { UnpublishTablesModal } from "../../components/UnpublishTablesModal";
import type {
  LibrarySection,
  SelectedItem,
} from "../hooks/library-bulk-selection.utils";
import {
  getAffectedCollectionIds,
  runLibraryItemUpdates,
  selectedItemToArchivable,
  selectedItemToMovable,
} from "../hooks/library-item-updates";
import { getArchiveLibraryCollectionsMessage } from "../utils";

type BulkAction = "move" | "unpublish";

type LibraryBulkActionsProps = {
  selectedItems: SelectedItem[];
  selectionSection: LibrarySection | null;
  isAllTables: boolean;
  defaultCollectionId: CollectionId | undefined;
  onActionComplete: (
    section: LibrarySection,
    affectedCollectionIds: CollectionId[],
  ) => void;
  onClear: () => void;
};

export function LibraryBulkActions({
  selectedItems,
  selectionSection,
  isAllTables,
  defaultCollectionId,
  onActionComplete,
  onClear,
}: LibraryBulkActionsProps) {
  const [action, setAction] = useState<BulkAction>();
  const setCollection = useSetCollection();
  const setArchive = useSetArchive();
  const { show: showConfirm, modalContent: confirmModal } = useConfirmation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const count = selectedItems.length;
  const message = ngettext(
    msgid`${count} item selected`,
    `${count} items selected`,
    count,
  );

  const hasTables = selectedItems.some((item) => item.model === "table");

  // A collection can't be moved into itself or one of its descendants.
  const movingCollectionIds = useMemo(
    () =>
      selectedItems
        .filter((item) => item.model === "collection")
        .map((item) => String(item.entityId)),
    [selectedItems],
  );

  const runBulkAction = async (
    applyToItem: (item: SelectedItem) => Promise<unknown>,
    destinationId: CollectionId | null,
    toast: { success: string; error: (failedCount: number) => string },
  ) => {
    const section = selectionSection;
    if (section == null) {
      return;
    }
    const { failedCount, affectedCollectionIds } = await runLibraryItemUpdates(
      selectedItems,
      applyToItem,
      destinationId,
    );
    if (failedCount > 0) {
      sendErrorToast(toast.error(failedCount));
    } else {
      sendSuccessToast(toast.success);
    }
    onActionComplete(section, affectedCollectionIds);
  };

  const handleMove = async (destinationId: RegularCollectionId | null) => {
    try {
      await runBulkAction(
        (item) =>
          setCollection(
            selectedItemToMovable(item),
            { id: destinationId ?? "root" },
            { notify: false },
          ),
        destinationId,
        {
          success: t`Moved`,
          error: (failedCount) =>
            t`Couldn't move ${failedCount} of ${count} items`,
        },
      );
    } finally {
      setAction(undefined);
    }
  };

  const handleUnpublished = () => {
    const section = selectionSection;
    setAction(undefined);
    if (section != null) {
      onActionComplete(section, getAffectedCollectionIds(selectedItems, null));
    }
  };

  const handleTrash = () =>
    runBulkAction(
      (item) =>
        setArchive(selectedItemToArchivable(item), true, { notify: false }),
      null,
      {
        success: t`Moved to trash`,
        error: (failedCount) =>
          t`Couldn't move ${failedCount} of ${count} items to trash`,
      },
    );

  const confirmTrash = () => {
    showConfirm({
      title: t`Move to trash?`,
      message:
        selectionSection === "data"
          ? getArchiveLibraryCollectionsMessage(count)
          : undefined,
      confirmButtonText: t`Move to trash`,
      onConfirm: handleTrash,
    });
  };

  return (
    <>
      <BulkActionBar opened={count > 0} message={message}>
        <BulkActionButton onClick={() => setAction("move")}>
          {t`Move`}
        </BulkActionButton>
        {!hasTables && (
          <BulkActionButton onClick={confirmTrash}>
            {t`Move to trash`}
          </BulkActionButton>
        )}
        {isAllTables && (
          <BulkActionDangerButton onClick={() => setAction("unpublish")}>
            {t`Unpublish`}
          </BulkActionDangerButton>
        )}
        <BulkActionButton onClick={onClear}>{t`Clear`}</BulkActionButton>
      </BulkActionBar>
      {action === "move" && selectionSection != null && (
        <LibraryMoveModal
          section={selectionSection}
          initialCollectionId={
            selectedItems[0]?.sourceCollectionId ?? defaultCollectionId ?? null
          }
          movingCollectionIds={movingCollectionIds}
          onMove={handleMove}
          onClose={() => setAction(undefined)}
        />
      )}
      {action === "unpublish" && (
        <UnpublishTablesModal
          isOpened
          tableIds={selectedItems.map((item) => item.entityId)}
          onUnpublish={handleUnpublished}
          onClose={() => setAction(undefined)}
        />
      )}
      {confirmModal}
    </>
  );
}

export function isMoveDestinationDisabled(
  item: OmniPickerItem,
  movingCollectionIds: string[],
): boolean {
  if (item.model !== "collection" || movingCollectionIds.length === 0) {
    return false;
  }
  const fullPath = (item.effective_location ?? item.location ?? "")
    .split("/")
    .filter(Boolean)
    .concat(String(item.id));
  return fullPath.some((id) => movingCollectionIds.includes(id));
}

type LibraryMoveModalProps = {
  section: LibrarySection;
  initialCollectionId: CollectionId | null;
  movingCollectionIds: string[];
  onMove: (destinationId: RegularCollectionId | null) => void;
  onClose: () => void;
};

function LibraryMoveModal({
  section,
  initialCollectionId,
  movingCollectionIds,
  onMove,
  onClose,
}: LibraryMoveModalProps) {
  const isDisabledItem = useCallback(
    (item: OmniPickerItem) =>
      isMoveDestinationDisabled(item, movingCollectionIds),
    [movingCollectionIds],
  );

  if (section === "snippets") {
    return (
      <CollectionPickerModal
        title={t`Move to…`}
        value={undefined}
        onChange={(destination) =>
          onMove(destination.id === "root" ? null : destination.id)
        }
        onClose={onClose}
        namespaces={["snippets"]}
        isDisabledItem={isDisabledItem}
        options={{
          hasPersonalCollections: false,
          canCreateCollections: true,
          hasRootCollection: true,
          hasSearch: false,
          hasConfirmButtons: true,
          hasRecents: false,
          hasLibrary: false,
        }}
      />
    );
  }

  return (
    <CollectionPickerModal
      title={t`Move to…`}
      value={
        initialCollectionId != null
          ? { id: initialCollectionId, model: "collection" }
          : undefined
      }
      onChange={(destination) => onMove(destination.id)}
      onClose={onClose}
      isDisabledItem={isDisabledItem}
      options={{
        hasLibrary: true,
        hasRootCollection: false,
        hasPersonalCollections: false,
        hasSearch: true,
        hasRecents: false,
        hasConfirmButtons: true,
        confirmButtonText: t`Move`,
      }}
      entityType={section === "data" ? "table" : "metric"}
    />
  );
}
