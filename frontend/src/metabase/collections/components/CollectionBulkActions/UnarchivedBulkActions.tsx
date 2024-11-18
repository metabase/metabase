import { useMemo } from "react";
import { t } from "ttag";

import { canArchiveItem, canMoveItem } from "metabase/collections/utils";
import { BulkActionButton } from "metabase/components/BulkActionBar";
import { useSelector } from "metabase/lib/redux";
import { Tooltip } from "metabase/ui/components";
import type { Collection, CollectionItem } from "metabase-types/api";

type UnarchivedBulkActionsProps = {
  selected: any[];
  collection: Collection;
  clearSelected: () => void;
  setSelectedItems: (items: CollectionItem[] | null) => void;
  setSelectedAction: (action: string) => void;
  onCopyToWorkspace: (items: CollectionItem[]) => void;
};

export const UnarchivedBulkActions = ({
  selected,
  collection,
  clearSelected,
  setSelectedItems,
  setSelectedAction,
  onCopyToWorkspace,
}: UnarchivedBulkActionsProps) => {
  // archive
  const canArchive = useMemo(() => {
    return selected.every(item => canArchiveItem(item, collection));
  }, [selected, collection]);

  const handleBulkArchive = async () => {
    const actions = selected.map(item => item.setArchived(true));
    Promise.all(actions).finally(() => clearSelected());
  };

  // move
  const canMove = useMemo(() => {
    return selected.every(item => canMoveItem(item, collection));
  }, [selected, collection]);

  const handleBulkMoveStart = () => {
    setSelectedItems(selected);
    setSelectedAction("move");
  };

  // copy to workspace
  const copyToWorkspaceEnabled = useSelector(
    state => state.embed.options.dashboard_workspace_copy_enabled,
  );

  const handleBulkCopyToWorkspace = () => {
    onCopyToWorkspace(selected);
    clearSelected();
  };

  const nonDashboardsSelected = selected
    .filter(item => item.model !== "dashboard")
    .map(item => item.id);

  return (
    <>
      <BulkActionButton
        disabled={!canMove}
        onClick={handleBulkMoveStart}
      >{t`Move`}</BulkActionButton>
      <BulkActionButton
        disabled={!canArchive}
        onClick={handleBulkArchive}
      >{t`Move to trash`}</BulkActionButton>
      {copyToWorkspaceEnabled && (
        <Tooltip
          display={nonDashboardsSelected.length > 0 ? "block" : "none"}
          zIndex={99999}
          color="white"
          bg="brand"
          label="Only dashboards can be copied. Please deselect all the other items."
        >
          <span>
            <BulkActionButton
              disabled={nonDashboardsSelected.length > 0}
              onClick={handleBulkCopyToWorkspace}
            >{t`Copy to workspace`}</BulkActionButton>
          </span>
        </Tooltip>
      )}
    </>
  );
};
