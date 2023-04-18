import React, { MouseEvent, useCallback } from "react";
import { useAsyncFn } from "react-use";
import cx from "classnames";
import { t } from "ttag";
import Icon from "metabase/components/Icon/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import Tooltip from "metabase/core/components/Tooltip";
import { Table, TableVisibilityType } from "metabase-types/api";

interface TableRowProps {
  table: Table;
  isSelected: boolean;
  onSelectTable: (table: Table) => void;
  onUpdateTableVisibility: (
    tables: Table[],
    visibility: TableVisibilityType,
  ) => void;
}

const TableRow = ({
  table,
  isSelected,
  onSelectTable,
  onUpdateTableVisibility,
}: TableRowProps) => {
  const handleSelect = useCallback(() => {
    onSelectTable(table);
  }, [table, onSelectTable]);

  const handleUpdateVisibility = useCallback(
    async (visibility: TableVisibilityType) => {
      await onUpdateTableVisibility([table], visibility);
    },
    [table, onUpdateTableVisibility],
  );

  return (
    <li className="hover-parent hover--visibility">
      <a
        className={cx(
          "AdminList-item flex align-center no-decoration text-wrap justify-between",
          { selected: isSelected },
        )}
        onClick={handleSelect}
      >
        {table.display_name}
        <div className="hover-child float-right">
          <ToggleVisibilityButton
            visibility={table.visibility_type}
            onUpdateTableVisibility={handleUpdateVisibility}
          />
        </div>
      </a>
    </li>
  );
};

interface ToggleVisibilityButtonProps {
  visibility: TableVisibilityType;
  hasMultipleTables?: boolean;
  onUpdateTableVisibility: (visibility: TableVisibilityType) => Promise<void>;
}

const ToggleVisibilityButton = ({
  hasMultipleTables,
  visibility,
  onUpdateTableVisibility,
}: ToggleVisibilityButtonProps) => {
  const isHidden = visibility != null;
  const [{ loading }, handleUpdate] = useAsyncFn(onUpdateTableVisibility);

  const handleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      handleUpdate(isHidden ? null : "hidden");
    },
    [isHidden, handleUpdate],
  );

  return (
    <Tooltip tooltip={getToggleTooltip(isHidden, hasMultipleTables)}>
      <IconButtonWrapper
        className={cx(
          "float-right",
          loading ? "cursor-not-allowed" : "brand-hover",
        )}
        disabled={loading}
        onClick={handleClick}
      >
        <Icon name={isHidden ? "eye" : "eye_crossed_out"} size={18} />
      </IconButtonWrapper>
    </Tooltip>
  );
};

const getToggleTooltip = (isHidden: boolean, hasMultipleTables?: boolean) => {
  if (hasMultipleTables) {
    return isHidden ? t`Unhide all` : t`Hide all`;
  } else {
    return isHidden ? t`Unhide` : t`Hide`;
  }
};

export default TableRow;
