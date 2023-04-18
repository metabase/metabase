import React, { MouseEvent, useCallback } from "react";
import { useAsyncFn } from "react-use";
import cx from "classnames";
import { t } from "ttag";
import Icon from "metabase/components/Icon/Icon";
import IconButtonWrapper from "metabase/components/IconButtonWrapper";
import { Table, TableVisibilityType } from "metabase-types/api";
import Tooltip from "metabase/core/components/Tooltip";

interface ToggleVisibilityButtonProps {
  tables: Table[];
  visibilityType: TableVisibilityType;
  onChangeTableVisibility: (
    tables: Table[],
    visibilityType: TableVisibilityType,
  ) => Promise<void>;
}

const ToggleVisibilityButton = ({
  tables,
  visibilityType,
  onChangeTableVisibility,
}: ToggleVisibilityButtonProps) => {
  const isHidden = visibilityType != null;
  const hasMultipleTables = tables.length > 1;
  const [{ loading }, handleChange] = useAsyncFn(onChangeTableVisibility);

  const handleClick = useCallback(
    (event: MouseEvent) => {
      event.stopPropagation();
      handleChange(tables, isHidden ? null : "hidden");
    },
    [tables, isHidden, handleChange],
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

const getToggleTooltip = (isHidden: boolean, hasMultipleTables: boolean) => {
  if (hasMultipleTables) {
    return isHidden ? t`Unhide all` : t`Hide all`;
  } else {
    return isHidden ? t`Unhide` : t`Hide`;
  }
};

export default ToggleVisibilityButton;
