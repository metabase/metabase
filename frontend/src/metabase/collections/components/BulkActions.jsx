/* eslint-disable react/prop-types */
import { memo } from "react";
import { Motion, spring } from "react-motion";
import { t, msgid, ngettext } from "ttag";
import _ from "underscore";

import CollectionCopyEntityModal from "metabase/collections/components/CollectionCopyEntityModal";
import { ANALYTICS_CONTEXT } from "metabase/collections/constants";
import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import Modal from "metabase/components/Modal";
import { CollectionMoveModal } from "metabase/containers/CollectionMoveModal";
import { useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui/components/overlays/Tooltip";

import {
  BulkActionsToast,
  CardButton,
  CardSide,
  ToastCard,
} from "./BulkActions.styled";

function BulkActions({
  selected,
  collection,
  selectedItems,
  selectedAction,
  onArchive,
  onMoveStart,
  onCloseModal,
  onMove,
  onCopy,
  onCopyToAnotherWorkspace,
  isNavbarOpen,
}) {
  const canMove = selected.every(item => canMoveItem(item, collection));
  const canArchive = selected.every(item => canArchiveItem(item, collection));
  const isVisible = selected.length > 0;
  const selectedDashboards = selected
    .filter(item => item.model === "dashboard")
    .map(item => item.id);
  const nonDashboardsSelected = selected
    .filter(item => item.model !== "dashboard")
    .map(item => item.id);

  const isCopyToWorkspaceEnabled = useSelector(
    state => state.embed.options.enable_copy_to_workspace,
  );

  return (
    <>
      <Motion
        defaultStyle={{
          opacity: 0,
          translateY: 100,
        }}
        style={{
          opacity: isVisible ? spring(1) : spring(0),
          translateY: isVisible ? spring(0) : spring(100),
        }}
      >
        {({ translateY }) => (
          <BulkActionsToast translateY={translateY} isNavbarOpen={isNavbarOpen}>
            <ToastCard dark>
              <CardSide>
                {ngettext(
                  msgid`${selected.length} item selected`,
                  `${selected.length} items selected`,
                  selected.length,
                )}
              </CardSide>
              <CardSide>
                <CardButton
                  medium
                  purple
                  disabled={!canMove}
                  onClick={onMoveStart}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Move Items`}
                >{t`Move`}</CardButton>
                <CardButton
                  medium
                  purple
                  disabled={!canArchive}
                  onClick={onArchive}
                  data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Archive Items`}
                >{t`Archive`}</CardButton>
              </CardSide>
              {isCopyToWorkspaceEnabled && selectedDashboards.length > 0 && (
                <CardSide>
                  <Tooltip
                    display={
                      nonDashboardsSelected.length > 0 ? "block" : "none"
                    }
                    zIndex={99999}
                    color="white"
                    bg="brand"
                    label="Only dashboards can be copied. Please deselect all the other items."
                  >
                    <CardButton
                      disabled={nonDashboardsSelected.length > 0}
                      medium
                      purple
                      onClick={() =>
                        onCopyToAnotherWorkspace(selectedDashboards)
                      }
                    >{t`Copy to another workspace`}</CardButton>
                  </Tooltip>
                </CardSide>
              )}
            </ToastCard>
          </BulkActionsToast>
        )}
      </Motion>
      {!_.isEmpty(selectedItems) && selectedAction === "copy" && (
        <Modal onClose={onCloseModal}>
          <CollectionCopyEntityModal
            entityObject={selectedItems[0]}
            onClose={onCloseModal}
            onSaved={() => {
              onCloseModal();
              onCopy();
            }}
          />
        </Modal>
      )}
      {!_.isEmpty(selectedItems) && selectedAction === "move" && (
        <Modal onClose={onCloseModal}>
          <CollectionMoveModal
            title={
              selectedItems.length > 1
                ? t`Move ${selectedItems.length} items?`
                : t`Move "${selectedItems[0].getName()}"?`
            }
            onClose={onCloseModal}
            onMove={onMove}
          />
        </Modal>
      )}
    </>
  );
}

export default memo(BulkActions);
