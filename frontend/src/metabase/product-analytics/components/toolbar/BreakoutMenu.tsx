import { useCallback, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import type { SettingWidgetProps } from "metabase/event-tables";
import {
  FilterColumnPicker,
  isCustomListItem,
} from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import type {
  ColumnGroupItemsContext,
  ColumnListItem,
  CustomListItem,
} from "metabase/querying/filters/components/FilterPicker/types";
import { Button, Icon, Menu, Text, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { type Breakout, withBreakoutSegment } from "../../analyses/breakout";
import type { UsersTable } from "../../analyses/types";
import { findColumnByRef } from "../../find-column";
import {
  useSegmentDrag,
  useSegmentDropTarget,
} from "../../segments/drag-context";
import { toPeopleSegmentRef } from "../../segments/people-segment-ref";
import {
  isTableColumnGroup,
  toSegmentPickerItem,
} from "../../segments/picker-items";
import { isPeopleSegment } from "../../segments/to-event-definition";
import { usePeoplePickerSegments } from "../../segments/use-people-picker-segments";
import { useTableQuery } from "../events/use-table-query";

import S from "./BreakoutMenu.module.css";
import DropTargetS from "./DropTarget.module.css";

const STAGE = -1;

/**
 * In the active gray of the pressed label beside it, hovered, clicked or
 * not: its tooltip says what it does.
 */
const CLEAR_BUTTON_VARS = {
  root: {
    "--button-bg": "var(--mb-color-button-default-neutral-hover)",
    "--button-hover": "var(--mb-color-button-default-neutral-hover)",
    "--button-pressed": "var(--mb-color-button-default-neutral-hover)",
  },
};

type BreakoutMenuProps = SettingWidgetProps<Breakout | null> & {
  /** The event table, whose columns and linked tables' columns it breaks out by. */
  table?: Table;
  /** The linked people table, whose segments it breaks out by. */
  usersTable?: UsersTable;
};

/**
 * "By Country", "By Person → Company", the one segment's name, or "2
 * segments". Null while unset, or while the property's column can't be found.
 */
const getButtonLabel = (
  value: Breakout | null,
  query: Lib.Query | undefined,
): string | null => {
  switch (value?.type) {
    case undefined:
      return null;
    case "property": {
      if (query === undefined) {
        return null;
      }
      try {
        const column = findColumnByRef(query, value.fieldRef);
        const { longDisplayName } = Lib.displayInfo(query, STAGE, column);
        return t`By ${longDisplayName}`;
      } catch {
        return null;
      }
    }
    case "cohorts": {
      const [first] = value.segments;
      const count = value.segments.length;
      return count === 1 && first !== undefined
        ? first.label
        : ngettext(msgid`${count} segment`, `${count} segments`, count);
    }
  }
};

/**
 * An icon button in the toolbar's button group, labeled while set, with a
 * button beside it that clears the breakout. Its menu is the filter popover's
 * column picker: a column breaks out by its values, and a people segment is
 * toggled, beside any already picked. Either closes the menu. A people segment
 * dragged from the palette lands on it too.
 */
export const BreakoutMenu = ({
  value,
  onChange,
  table,
  usersTable,
}: BreakoutMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const query = useTableQuery(table);
  const buttonLabel = getButtonLabel(value, query);
  const isSet = buttonLabel !== null;
  const { onBreakOutBySegment } = useSegmentDrag();
  const drop = useSegmentDropTarget({
    accepts: (segment) =>
      isPeopleSegment(segment) && onBreakOutBySegment !== undefined,
    onDrop: (segment) => onBreakOutBySegment?.(segment),
  });

  return (
    // Siblings in the toolbar's button group, so the clear button joins the
    // label without a button inside a button.
    <>
      <Menu position="bottom-start" opened={isOpen} onChange={setIsOpen}>
        <Menu.Target>
          <Tooltip label={t`Break out`} disabled={isOpen || isSet}>
            <Button
              variant="default"
              px={isSet ? undefined : "sm"}
              leftSection={isSet ? <Icon name="split_branch" /> : undefined}
              aria-label={isSet ? undefined : t`Break out`}
              className={
                isSet
                  ? `${S.setLabel} ${DropTargetS.target}`
                  : DropTargetS.target
              }
              aria-pressed={isSet}
              disabled={table === undefined}
              {...drop.dropProps}
            >
              {buttonLabel ?? <Icon name="split_branch" />}
            </Button>
          </Tooltip>
        </Menu.Target>
        {/* Menus overflow visibly, for submenus; the picker needs to scroll. */}
        <Menu.Dropdown p={0} style={{ overflowY: "auto" }}>
          {query !== undefined ? (
            <BreakoutPicker
              query={query}
              usersTable={usersTable}
              value={value}
              onChange={onChange}
              onClose={() => setIsOpen(false)}
            />
          ) : (
            <Text c="text-secondary" px="sm" py="xs">
              {t`Loading the table…`}
            </Text>
          )}
        </Menu.Dropdown>
      </Menu>
      {isSet && (
        <Tooltip label={t`Remove breakout`}>
          <Button
            className={S.clearButton}
            variant="default"
            vars={() => CLEAR_BUTTON_VARS}
            // In a section, so it centers like other icon-only buttons.
            leftSection={<Icon name="close" />}
            aria-label={t`Remove breakout`}
            onClick={() => onChange(null)}
          />
        </Tooltip>
      )}
    </>
  );
};

type BreakoutPickerProps = {
  query: Lib.Query;
  usersTable: UsersTable | undefined;
  value: Breakout | null;
  onChange: (value: Breakout | null) => void;
  onClose: () => void;
};

/**
 * The filter popover's column picker on the event table, without its event
 * segments: the event table's columns, then each linked table's, with the
 * people table's segments and this session's drafts of them in its group.
 */
const BreakoutPicker = ({
  query,
  usersTable,
  value,
  onChange,
  onClose,
}: BreakoutPickerProps) => {
  const peopleSegments = usePeoplePickerSegments(usersTable);
  const pickedSegments = value?.type === "cohorts" ? value.segments : [];

  const getGroupItems = useCallback(
    ({ info, columns }: ColumnGroupItemsContext): CustomListItem[] =>
      usersTable !== undefined &&
      !info.isSourceTable &&
      isTableColumnGroup(query, columns, usersTable.table)
        ? peopleSegments.map(toSegmentPickerItem)
        : [],
    [query, usersTable, peopleSegments],
  );

  const handleSegmentSelect = (item: CustomListItem) => {
    const segment = peopleSegments.find(({ key }) => key === item.key);
    if (segment === undefined) {
      return;
    }
    const ref = toPeopleSegmentRef(segment);
    const isPicked = pickedSegments.some((picked) => picked.key === ref.key);
    if (isPicked) {
      const segments = pickedSegments.filter(
        (picked) => picked.key !== ref.key,
      );
      onChange(segments.length > 0 ? { type: "cohorts", segments } : null);
    } else {
      onChange(withBreakoutSegment(value, ref));
    }
    onClose();
  };

  const handleColumnSelect = (item: ColumnListItem) => {
    onChange({
      type: "property",
      fieldRef: Lib.legacyRef(query, STAGE, item.column),
    });
    onClose();
  };

  const isSelected = (item: ColumnListItem | CustomListItem) => {
    if (isCustomListItem(item)) {
      return pickedSegments.some((picked) => picked.key === item.key);
    }
    return (
      value?.type === "property" &&
      _.isEqual(Lib.legacyRef(query, STAGE, item.column), value.fieldRef)
    );
  };

  return (
    <FilterColumnPicker
      query={query}
      stageIndexes={[STAGE]}
      checkItemIsSelected={(item) =>
        isCustomListItem(item) || "column" in item ? isSelected(item) : false
      }
      onColumnSelect={handleColumnSelect}
      getGroupItems={getGroupItems}
      onCustomItemSelect={handleSegmentSelect}
      withSegments={false}
      withCustomExpression={false}
    />
  );
};
