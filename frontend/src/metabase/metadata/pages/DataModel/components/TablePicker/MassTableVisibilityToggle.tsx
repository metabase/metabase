import type { MouseEvent } from "react";
import { t } from "ttag";

import { useUpdateTableListMutation } from "metabase/api";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { ActionIcon, Icon, Loader, Tooltip } from "metabase/ui";
import type { Table } from "metabase-types/api";

interface Props {
  className?: string;
  tables: Table[];
}

export function MassTableVisibilityToggle({ className, tables }: Props) {
  const [updateTables, { isLoading }] = useUpdateTableListMutation();
  const ids = tables.map((table) => table.id);
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();
  const isHidden = false;

  const hide = async () => {
    const { error } = await updateTables({
      ids,
      visibility_type: "hidden",
    });

    if (error) {
      sendErrorToast(t`Failed to hide tables`);
    } else {
      sendSuccessToast(t`Tables hidden`, async () => {
        const { error } = await updateTables({
          ids,
          visibility_type: null,
        });
        sendUndoToast(error);
      });
    }
  };

  const unhide = async () => {
    const { error } = await updateTables({
      ids,
      visibility_type: null,
    });

    if (error) {
      sendErrorToast(t`Failed to unhide`);
    } else {
      sendSuccessToast(t`Tables unhidden}`, async () => {
        const { error } = await updateTables({
          ids,
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
