import cx from "classnames";
import type { CSSProperties, ReactNode } from "react";
import { t } from "ttag";

import { useTranslateContent } from "metabase/content-translation/hooks";
import CS from "metabase/css/core/index.css";
import type {
  DataSelectorDatabase,
  DataSelectorTable,
} from "metabase/querying/common/components/DataSelector";
import { Box, Icon } from "metabase/ui";

import DataSelectorS from "./DataSelector/DataSelector.module.css";

export type TriggerComponentProps = {
  database?: DataSelectorDatabase | null;
  table?: DataSelectorTable | null;
  hasMultipleSchemas?: boolean;
};

export function Trigger({
  className,
  style,
  showDropdownIcon = false,
  iconSize = 8,
  children,
  isMantine = false,
}: {
  className?: string;
  style?: CSSProperties;
  showDropdownIcon?: boolean;
  iconSize?: number | string;
  isMantine?: boolean;
  children: ReactNode;
}) {
  if (isMantine) {
    return (
      <Box className={DataSelectorS.TriggerContainer}>
        {children}
        {showDropdownIcon && (
          <Box className={DataSelectorS.TriggerContainerIcon}>
            <Icon name="chevrondown" size={iconSize} />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <span
      className={
        className ||
        cx(CS.px2, CS.py2, CS.textBold, CS.cursorPointer, CS.textDefault)
      }
      style={style}
    >
      {children}
      {showDropdownIcon && (
        <Icon className={CS.ml1} name="chevrondown" size={iconSize} />
      )}
    </span>
  );
}

export function DatabaseTrigger({ database }: TriggerComponentProps) {
  const tc = useTranslateContent();
  return database ? (
    <span
      className={cx(CS.textWrap, CS.noDecoration)}
      data-testid="selected-database"
    >
      {tc(database.name)}
    </span>
  ) : (
    <span
      className={cx(CS.textMedium, CS.noDecoration)}
    >{t`Select a database`}</span>
  );
}

export function TableTrigger({ table }: TriggerComponentProps) {
  const tc = useTranslateContent();
  return table ? (
    <span
      className={cx(CS.textWrap, CS.noDecoration)}
      data-testid="selected-table"
    >
      {tc(table.display_name || table.name)}
    </span>
  ) : (
    <span
      className={cx(CS.textMedium, CS.noDecoration)}
    >{t`Select a table`}</span>
  );
}
