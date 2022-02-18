import React, { useState } from "react";
import { t } from "ttag";
import cx from "classnames";
import Icon from "metabase/components/Icon";
import { color } from "metabase/lib/colors";
import { Table } from "metabase-types/types/Table";

interface ToggleVisibilityButtonProps {
  setVisibilityForTables: (tables: Table[], status: "hidden" | null) => void;
  tables: Table[];
  isHidden: boolean;
}

export const ToggleVisibilityButton = ({
  setVisibilityForTables,
  tables,
  isHidden,
}: ToggleVisibilityButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleToggle = async (e: React.KeyboardEvent | React.MouseEvent) => {
    e.stopPropagation();

    if (isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      await setVisibilityForTables(tables, isHidden ? null : "hidden");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Icon
      tabIndex={-1}
      name={isHidden ? "eye" : "eye_crossed_out"}
      onClick={handleToggle}
      onKeyUp={(e: React.KeyboardEvent) => e.key === "Enter" && handleToggle(e)}
      disabled={isLoading}
      tooltip={
        tables.length > 1
          ? isHidden
            ? t`Unhide all`
            : t`Hide all`
          : isHidden
          ? t`Unhide`
          : t`Hide`
      }
      size={18}
      className={cx(
        "float-right",
        isLoading ? "cursor-not-allowed" : "cursor-pointer",
      )}
      hover={{ color: isLoading ? undefined : color("brand") }}
    />
  );
};
