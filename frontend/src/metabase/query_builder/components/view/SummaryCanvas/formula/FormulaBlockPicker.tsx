import { t } from "ttag";

import { getColumnIcon } from "metabase/common/utils/columns";
import { Box, Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";

import {
  BLOCK_FUNCTIONS,
  type BlockFunction,
  getBlockColumns,
  getBlockFunction,
  getFunctionDisplayName,
} from "./formula-blocks";
import type { BlockClick } from "./formula-preview";
import { findFormulaColumn, tableFormulaColumns } from "./table-formula";

/** Menu for swapping the function or column of a clicked formula block. */
export function FormulaBlockPicker({
  query,
  click,
  onSelectFunction,
  onSelectColumn,
  onEditAsText,
  onClose,
}: {
  query: Lib.Query;
  click: BlockClick;
  onSelectFunction: (fn: BlockFunction) => void;
  onSelectColumn: (column: Lib.ColumnMetadata) => void;
  onEditAsText: () => void;
  onClose: () => void;
}) {
  const { anchor, call, part, columnIndex } = click;
  const currentFunction = getBlockFunction(call.name.text);

  return (
    <Menu
      opened
      onChange={(opened) => !opened && onClose()}
      position="bottom-start"
      offset={6}
    >
      <Menu.Target>
        <Box
          pos="fixed"
          left={anchor.left}
          top={anchor.top}
          w={anchor.width}
          h={anchor.height}
          style={{ pointerEvents: "none" }}
        />
      </Menu.Target>
      <Menu.Dropdown mah="22rem" style={{ overflowY: "auto" }}>
        {part === "function" ? (
          <FunctionItems
            current={currentFunction}
            onSelect={onSelectFunction}
          />
        ) : (
          <ColumnItems
            query={query}
            fn={currentFunction}
            currentLabel={call.columns[columnIndex]?.label}
            onSelect={onSelectColumn}
          />
        )}
        <Menu.Divider />
        <Menu.Item
          leftSection={<Icon name="pencil" aria-hidden />}
          onClick={onEditAsText}
        >
          {t`Edit as text`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function FunctionItems({
  current,
  onSelect,
}: {
  current: BlockFunction | undefined;
  onSelect: (fn: BlockFunction) => void;
}) {
  return (
    <>
      <Menu.Label>{t`Calculation`}</Menu.Label>
      {BLOCK_FUNCTIONS.map((fn) => (
        <Menu.Item
          key={fn}
          rightSection={
            fn === current ? (
              <Icon name="check" c="core-brand" aria-hidden />
            ) : null
          }
          onClick={() => onSelect(fn)}
        >
          {getFunctionDisplayName(fn)}
        </Menu.Item>
      ))}
    </>
  );
}

function ColumnItems({
  query,
  fn,
  currentLabel,
  onSelect,
}: {
  query: Lib.Query;
  fn: BlockFunction | undefined;
  currentLabel: string | undefined;
  onSelect: (column: Lib.ColumnMetadata) => void;
}) {
  const columns = fn ? getBlockColumns(query, fn) : tableFormulaColumns(query);
  const current =
    currentLabel != null
      ? findFormulaColumn(query, columns, currentLabel)
      : undefined;

  return (
    <>
      <Menu.Label>{t`Column`}</Menu.Label>
      {columns.map((column) => {
        const { displayName, name } = Lib.displayInfo(query, -1, column);
        return (
          <Menu.Item
            key={name}
            leftSection={<Icon name={getColumnIcon(column)} aria-hidden />}
            rightSection={
              column === current ? (
                <Icon name="check" c="core-brand" aria-hidden />
              ) : null
            }
            onClick={() => onSelect(column)}
          >
            {displayName}
          </Menu.Item>
        );
      })}
    </>
  );
}
