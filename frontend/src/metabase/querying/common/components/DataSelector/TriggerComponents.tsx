import cx from "classnames";
import type { CSSProperties, ReactNode } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import { Box, Flex, Icon, Text } from "metabase/ui";

import DataSelectorS from "./DataSelector.module.css";
import type {
  DataSelectorDatabase,
  DataSelectorField,
  DataSelectorTable,
} from "./types";

export type TriggerComponentProps = {
  database?: DataSelectorDatabase | null;
  table?: DataSelectorTable | null;
  field?: DataSelectorField | null;
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
    <Flex
      component="span"
      align="center"
      className={
        className || cx(CS.px2, CS.py2, CS.cursorPointer, CS.textDefault)
      }
      data-testid="trigger"
      style={style}
    >
      {children}
      {showDropdownIcon && (
        <Icon
          className={cx(CS.ml1, CS.flexNoShrink)}
          name="chevrondown"
          size={iconSize}
        />
      )}
    </Flex>
  );
}

export function FieldTrigger({
  table,
  field,
  hasMultipleSchemas,
}: TriggerComponentProps) {
  if (!field || !table) {
    return <Text>{t`Select...`}</Text>;
  }

  return (
    <div>
      <Box className={DataSelectorS.TextSchema}>
        {hasMultipleSchemas && table.schema_name + " > "}
        {table.display_name}
      </Box>
      <Text lh="1.2rem">{field.display_name}</Text>
    </div>
  );
}

export function DatabaseTrigger({ database }: TriggerComponentProps) {
  return database ? (
    <span
      className={cx(CS.textWrap, CS.noDecoration)}
      data-testid="selected-database"
    >
      {database.name}
    </span>
  ) : (
    <span
      className={cx(CS.textMedium, CS.noDecoration, CS.textNoWrap)}
    >{t`Select a database`}</span>
  );
}

export function TableTrigger({ table }: TriggerComponentProps) {
  return table ? (
    <span
      className={cx(CS.textWrap, CS.noDecoration)}
      data-testid="selected-table"
    >
      {table.display_name || table.name}
    </span>
  ) : (
    <span
      className={cx(CS.textMedium, CS.noDecoration)}
    >{t`Select a table`}</span>
  );
}
