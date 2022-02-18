import React from "react";
import cx from "classnames";
import { isSyncCompleted } from "metabase/lib/syncing";
import { ToggleVisibilityButton } from "./ToggleVisibilityButton";
import { PLUGIN_ADVANCED_PERMISSIONS } from "metabase/plugins";

interface TableRowProps {
  setVisibilityForTables: (tables: any[], status: "hidden" | null) => void;
  selectTable: (table: any) => void;
  table: any;
  selected: boolean;
}

export const TableRow = ({
  table,
  selectTable,
  selected,
  setVisibilityForTables,
}: TableRowProps) => {
  const canChangeVisibility =
    isSyncCompleted(table) &&
    PLUGIN_ADVANCED_PERMISSIONS.canEditEntityDataModel(table);

  return (
    <li key={table.id} className="hover-parent hover--visibility">
      <a
        className={cx(
          "AdminList-item flex align-center no-decoration text-wrap justify-between",
          { selected, disabled: !isSyncCompleted(table) },
        )}
        onClick={() => selectTable(table)}
      >
        {table.display_name}
        {canChangeVisibility && (
          <div className="hover-child float-right">
            <ToggleVisibilityButton
              tables={[table]}
              isHidden={table.visibility_type != null}
              setVisibilityForTables={setVisibilityForTables}
            />
          </div>
        )}
      </a>
    </li>
  );
};
