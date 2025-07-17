import type { MouseEvent } from "react";
import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Loader, Tooltip } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  className?: string;
  table: Table;
}

export function TableVisibilityToggle({ className, table }: Props) {
  const [updateTable, { isLoading }] = useUpdateTableMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const isHidden = table.visibility_type != null;

  const hide = async () => {
    const { error } = await updateTable({
      id: table.id,
      visibility_type: "hidden",
    });

    if (error) {
      sendErrorToast(t`Failed to hide ${table.display_name}`);
    } else {
      sendSuccessToast(t`Hid ${table.display_name}`, async () => {
        const { error } = await updateTable({
          id: table.id,
          visibility_type: null,
        });
        sendUndoToast(error);
      });
    }
  };

  const unhide = async () => {
    const { error } = await updateTable({
      id: table.id,
      visibility_type: null,
    });

    if (error) {
      sendErrorToast(t`Failed to unhide ${table.display_name}`);
    } else {
      sendSuccessToast(t`Unhid ${table.display_name}`, async () => {
        const { error } = await updateTable({
          id: table.id,
          visibility_type: "hidden",
        });
        sendUndoToast(error);
      });
    }
  };

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();

    if (isHidden) {
      unhide();
    } else {
      hide();
    }
  };

  if (isLoading) {
    return (
      <ActionIcon disabled variant="transparent">
        <Loader size="xs" data-testid="loading-indicator" />
      </ActionIcon>
    );
  }

  return (
    <Tooltip label={isHidden ? t`Unhide table` : t`Hide table`}>
      <ActionIcon
        aria-label={isHidden ? t`Unhide table` : t`Hide table`}
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
