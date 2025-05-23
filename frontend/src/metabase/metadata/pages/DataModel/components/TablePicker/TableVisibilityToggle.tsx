import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { ActionIcon } from "metabase/ui";
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

  return (
    <ActionIcon
      name={isHidden ? "eye_crossed_out" : "eye"}
      className={className}
      onClick={async (evt) => {
        evt.stopPropagation();
        const hide = () =>
          updateTable({ id: table.id, visibility_type: "hidden" });
        const unhide = () =>
          updateTable({ id: table.id, visibility_type: null });

        if (isHidden) {
          const { error } = await unhide();
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
        } else {
          const { error } = await hide();
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
        }
      }}
    />
  );
}
