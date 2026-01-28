import type { MouseEvent } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateTableListMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Loader, Tooltip } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  className?: string;
  tables: Table[];
  onUpdate: () => void;
}

export function BulkTableVisibilityToggle({
  className,
  tables,
  onUpdate,
}: Props) {
  const [updateTables, { isLoading }] = useUpdateTableListMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const areAllHidden = tables.every((table) => table.visibility_type != null);
  const onUpdateRef = useLatest(onUpdate);

  const hide = async () => {
    const ids = tables
      .filter((table) => table.visibility_type == null)
      .map((table) => table.id);
    const { error } = await updateTables({
      ids,
      visibility_type: "hidden",
    });

    onUpdateRef.current();

    if (error) {
      sendErrorToast(t`Failed to hide tables`);
    } else {
      sendSuccessToast(t`Tables hidden`, async () => {
        const { error } = await updateTables({
          ids,
          visibility_type: null,
        });

        onUpdateRef.current();
        sendUndoToast(error);
      });
    }
  };

  const unhide = async () => {
    const ids = tables.map((table) => table.id);
    const { error } = await updateTables({
      ids,
      visibility_type: null,
    });

    onUpdateRef.current();

    if (error) {
      sendErrorToast(t`Failed to unhide`);
    } else {
      sendSuccessToast(t`Tables unhidden`, async () => {
        const { error } = await updateTables({
          ids,
          visibility_type: "hidden",
        });

        onUpdateRef.current();
        sendUndoToast(error);
      });
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();

    if (areAllHidden) {
      unhide();
    } else {
      hide();
    }
  };

  if (isLoading) {
    return (
      <ActionIcon disabled variant="transparent">
        <Loader data-testid="loading-indicator" size="xs" />
      </ActionIcon>
    );
  }

  return (
    <Tooltip label={areAllHidden ? t`Unhide all tables` : t`Hide all tables`}>
      <ActionIcon
        aria-label={areAllHidden ? t`Unhide all tables` : t`Hide all tables`}
        className={className}
        disabled={isLoading}
        variant="transparent"
        onClick={handleClick}
      >
        <Icon name={areAllHidden ? "eye_crossed_out" : "eye"} />
      </ActionIcon>
    </Tooltip>
  );
}
