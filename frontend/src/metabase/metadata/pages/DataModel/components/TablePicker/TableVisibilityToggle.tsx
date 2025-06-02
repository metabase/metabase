import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { Table } from "metabase-types/api";

export function TableVisibilityToggle({
  table,
  className,
}: {
  table?: Table;
  className?: string;
}) {
  const [updateTable] = useUpdateTableMutation();
  const [sendToast] = useToast();

  if (!table) {
    return null;
  }

  const isHidden = table?.visibility_type !== null;

  const hide = async () => {
    const { error } = await updateTable({
      id: table.id,
      visibility_type: "hidden",
    });
    if (error) {
      sendToast({
        icon: "warning",
        toastColor: "warning",
        message: t`Failed to hide ${table.display_name}`,
      });
    } else {
      sendToast({
        message: t`Hid ${table.display_name}`,
        actionLabel: t`Undo`,
        action: unhide,
      });
    }
  };

  const unhide = async () => {
    const { error } = await updateTable({
      id: table.id,
      visibility_type: null,
    });
    if (error) {
      sendToast({
        icon: "warning",
        toastColor: "warning",
        message: t`Failed to unhide ${table.display_name}`,
      });
    } else {
      sendToast({
        message: t`Unhid ${table.display_name}`,
        actionLabel: t`Undo`,
        action: hide,
      });
    }
  };

  return (
    <Tooltip label={isHidden ? t`Unhide table` : t`Hide table`}>
      <ActionIcon
        className={className}
        variant="transparent"
        onClick={(event) => {
          event.stopPropagation();

          if (isHidden) {
            unhide();
          } else {
            hide();
          }
        }}
      >
        <Icon name={isHidden ? "eye_crossed_out" : "eye"} />
      </ActionIcon>
    </Tooltip>
  );
}
