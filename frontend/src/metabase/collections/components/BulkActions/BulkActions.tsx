import { memo, useMemo } from "react";
import { msgid, ngettext } from "ttag";
import _ from "underscore";

import { isTrashedCollection } from "metabase/collections/utils";
import { BulkMoveModal } from "metabase/containers/MoveModal";
import { Transition } from "metabase/ui";
import type { Collection, CollectionItem } from "metabase-types/api";

import { ArchivedBulkActions } from "./ArchivedBulkActions";
import { BulkActionsToast, CardSide, ToastCard } from "./BulkActions.styled";
import { UnarchivedBulkActions } from "./UnarchivedBulkActions";

const slideIn = {
  in: { opacity: 1, transform: "translate(-50%, 0)" },
  out: { opacity: 0, transform: "translate(-50%, 100px)" },
  common: { transformOrigin: "top" },
  transitionProperty: "transform, opacity",
};

type BulkActionsProps = {
  selected: any[];
  collection: Collection;
  selectedItems: CollectionItem[] | null;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  selectedAction: string | null;
  setSelectedAction: (action: string | null) => void;
  clearSelected: () => void;
  isNavbarOpen: boolean;
};

export const BulkActions = memo(
  ({
    collection,
    selected,
    clearSelected,
    selectedItems,
    setSelectedItems,
    selectedAction,
    setSelectedAction,
    isNavbarOpen,
  }: BulkActionsProps) => {
    const hasSelectedItems = useMemo(
      () => !!selectedItems && !_.isEmpty(selectedItems),
      [selectedItems],
    );

    const handleCloseModal = () => {
      setSelectedItems(null);
      setSelectedAction(null);
      clearSelected();
    };

    const tryOrClear = (promise: Promise<any>) =>
      promise.finally(() => clearSelected());

    const handleBulkMove = async (
      collection: Pick<Collection, "id"> & Partial<Collection>,
    ) => {
      if (selectedItems) {
        await tryOrClear(
          Promise.all(
            selectedItems.map(item => item.setCollection?.(collection)),
          ),
        );
        handleCloseModal();
      }
    };

    return (
      <>
        <Transition
          mounted={selected.length > 0}
          transition={slideIn}
          duration={400}
          timingFunction="ease"
        >
          {styles => (
            <BulkActionsToast style={styles} isNavbarOpen={isNavbarOpen}>
              <ToastCard dark data-testid="toast-card">
                <CardSide>
                  {ngettext(
                    msgid`${selected.length} item selected`,
                    `${selected.length} items selected`,
                    selected.length,
                  )}
                </CardSide>
                <CardSide>
                  {isTrashedCollection(collection) ? (
                    <ArchivedBulkActions
                      collection={collection}
                      selectedItems={selectedItems}
                      setSelectedItems={setSelectedItems}
                      selected={selected}
                      clearSelected={clearSelected}
                      selectedAction={selectedAction}
                      setSelectedAction={setSelectedAction}
                    />
                  ) : (
                    <UnarchivedBulkActions
                      selected={selected}
                      collection={collection}
                      clearSelected={clearSelected}
                      setSelectedItems={setSelectedItems}
                      setSelectedAction={setSelectedAction}
                    />
                  )}
                </CardSide>
              </ToastCard>
            </BulkActionsToast>
          )}
        </Transition>

        {selectedItems && hasSelectedItems && selectedAction === "move" && (
          <BulkMoveModal
            selectedItems={selectedItems}
            onClose={handleCloseModal}
            onMove={handleBulkMove}
            initialCollectionId={
              isTrashedCollection(collection) ? "root" : collection.id
            }
          />
        )}
      </>
    );
  },
);

BulkActions.displayName = "BulkActions";
