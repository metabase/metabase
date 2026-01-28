import type { MouseEvent } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Loader, Tooltip } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  className?: string;
  table: Table;
  onUpdate: () => void;
}

export function TableVisibilityToggle({ className, table, onUpdate }: Props) {
  const [updateTable, { isLoading }] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const isHidden = table.visibility_type != null;
  const onUpdateRef = useLatest(onUpdate);

  const hide = async () => {
    const { error } = await updateTable({
      id: table.id,
      visibility_type: "hidden",
    });

    onUpdateRef.current();

    if (error) {
      sendErrorToast(t`Failed to hide ${table.display_name}`);
    } else {
      sendSuccessToast(t`Hid ${table.display_name}`, async () => {
        const { error } = await updateTable({
          id: table.id,
          visibility_type: null,
        });

        onUpdateRef.current();
        sendUndoToast(error);
      });
    }
  };

  const unhide = async () => {
    const { error } = await updateTable({
      id: table.id,
      visibility_type: null,
    });

    onUpdateRef.current();

    if (error) {
      sendErrorToast(t`Failed to unhide ${table.display_name}`);
    } else {
      sendSuccessToast(t`Unhid ${table.display_name}`, async () => {
        const { error } = await updateTable({
          id: table.id,
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

    if (isHidden) {
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
    <Tooltip label={isHidden ? t`Unhide table` : t`Hide table`}>
      <ActionIcon
        aria-label={isHidden ? t`Unhide table` : t`Hide table`}
        c={table.visibility_type != null ? "text-secondary" : undefined}
        className={className}
        disabled={isLoading}
        variant="transparent"
        onClick={handleClick}
      >
        <Icon name={isHidden ? "eye_crossed_out" : "eye"} />
      </ActionIcon>
    </Tooltip>
  );
}
