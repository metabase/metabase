import { t } from "ttag";

import { useUpdateTableMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { Icon } from "metabase/ui";
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

  const isHidden = table?.visibility_type === "hidden";

  return (
    <Icon
      name={isHidden ? "eye_crossed_out" : "eye"}
      className={className}
      onClick={async (evt) => {
        evt.stopPropagation();
        const hide = () =>
          updateTable({ id: table.id, visibility_type: "hidden" });
        const unhide = () =>
          updateTable({ id: table.id, visibility_type: null });

        if (isHidden) {
          await unhide();
          sendToast({
            message: t`Unhid ${table.display_name}`,
            actionLabel: t`Undo`,
            action: hide,
          });
        } else {
          await hide();
          sendToast({
            message: t`Hid ${table.display_name}`,
            actionLabel: t`Undo`,
            action: unhide,
          });
        }
      }}
    />
  );
}
