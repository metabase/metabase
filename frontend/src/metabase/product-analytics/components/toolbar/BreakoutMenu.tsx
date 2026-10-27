import { useMemo, useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { ListSearchField } from "metabase/common/components/ListSearchField";
import { useMetadataProvider } from "metabase/metadata-store";
import {
  FilterColumnPicker,
  isSegmentListItem,
} from "metabase/querying/filters/components/FilterPicker/FilterColumnPicker";
import type {
  ColumnListItem,
  SegmentListItem,
} from "metabase/querying/filters/components/FilterPicker/types";
import { Box, Button, Icon, Menu, Text, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { IconName, Table } from "metabase-types/api";

import type { Breakout } from "../../analyses/breakout";
import { toPeopleSegmentRef } from "../../segments/people-segment-ref";
import type { PeopleSegmentRef } from "../../segments/types";
import { usePaletteSegments } from "../../segments/use-palette-segments";
import type { SettingWidgetProps } from "../../settings/types";

import S from "./BreakoutMenu.module.css";

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

const MAX_DROPDOWN_HEIGHT = "60vh";
const DROPDOWN_WIDTH = 280;

type ColumnOption = { value: string; label: string; icon: IconName };

type BreakoutMenuProps = SettingWidgetProps<Breakout | null> & {
  /** Event table properties, for when no users table is linked. */
  columns?: ColumnOption[];
  /** The linked users table, whose segments and fields it breaks out by. */
  usersTable?: Table;
};

/** "By Country", the one segment's name, or "2 Segments"; null while unset. */
const getButtonLabel = (
  value: Breakout | null,
  columns: ColumnOption[],
  usersTable: Table | undefined,
): string | null => {
  switch (value?.type) {
    case undefined:
      return null;
    case "property": {
      const name =
        usersTable?.fields?.find((field) => field.name === value.column)
          ?.display_name ??
        columns.find((option) => option.value === value.column)?.label;
      return name !== undefined ? t`By ${name}` : null;
    }
    case "cohorts": {
      const [first] = value.segments;
      const count = value.segments.length;
      return count === 1 && first !== undefined
        ? first.label
        : ngettext(msgid`${count} Segment`, `${count} Segments`, count);
    }
  }
};

/**
 * An icon button in the toolbar's button group, labeled while set, with a
 * button beside it that clears the breakout. Its menu is the users table's
 * segments and fields, in the same picker as the filter popover's: a field
 * breaks out by its values, and a segment is toggled, beside any already
 * picked. Either closes the menu.
 */
export const BreakoutMenu = ({
  value,
  onChange,
  columns = [],
  usersTable,
}: BreakoutMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const label = getButtonLabel(value, columns, usersTable);
  const isSet = label !== null;
  const canBreakOut = columns.length > 0 || usersTable !== undefined;

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
              className={isSet ? S.setLabel : undefined}
              aria-pressed={isSet}
              disabled={!canBreakOut}
            >
              {label ?? <Icon name="split_branch" />}
            </Button>
          </Tooltip>
        </Menu.Target>
        {/* Menus overflow visibly, for submenus; the picker needs to scroll. */}
        <Menu.Dropdown p={0} style={{ overflowY: "auto" }}>
          {usersTable !== undefined ? (
            <UsersTablePicker
              usersTable={usersTable}
              value={value}
              onChange={onChange}
              onClose={() => setIsOpen(false)}
            />
          ) : (
            <PropertyOptions
              columns={columns}
              value={value?.type === "property" ? value.column : null}
              onChange={(column) => onChange({ type: "property", column })}
            />
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

type UsersTablePickerProps = {
  usersTable: Table;
  value: Breakout | null;
  onChange: (value: Breakout | null) => void;
  onClose: () => void;
};

/**
 * The filter popover's column picker on the users table: its segments, then
 * its fields. Mounted with the dropdown, so it lists the current segments.
 */
const UsersTablePicker = ({
  usersTable,
  value,
  onChange,
  onClose,
}: UsersTablePickerProps) => {
  const metadataProvider = useMetadataProvider(usersTable.db_id);
  const query = useMemo(() => {
    const metadata = Lib.tableOrCardMetadata(metadataProvider, usersTable.id);
    return metadata
      ? Lib.queryFromTableOrCardMetadata(metadataProvider, metadata)
      : undefined;
  }, [metadataProvider, usersTable.id]);
  // The picker's segments carry no id; the saved segments, matched by name, do.
  const { saved } = usePaletteSegments(usersTable.id, "people", []);
  const pickedSegments = value?.type === "cohorts" ? value.segments : [];

  const findSegmentRef = (
    item: SegmentListItem,
  ): PeopleSegmentRef | undefined => {
    const segment = saved.find((option) => option.name === item.displayName);
    return segment !== undefined ? toPeopleSegmentRef(segment) : undefined;
  };

  const handleSegmentSelect = (item: SegmentListItem) => {
    const ref = findSegmentRef(item);
    if (ref === undefined) {
      return;
    }
    const isPicked = pickedSegments.some((picked) => picked.key === ref.key);
    const segments = isPicked
      ? pickedSegments.filter((picked) => picked.key !== ref.key)
      : [...pickedSegments, ref];
    onChange(segments.length > 0 ? { type: "cohorts", segments } : null);
    onClose();
  };

  const handleColumnSelect = (item: ColumnListItem) => {
    if (query === undefined) {
      return;
    }
    // A table the users table links to can't be broken out by.
    const info = Lib.displayInfo(query, STAGE, item.column);
    if (info.isImplicitlyJoinable || info.isFromJoin) {
      return;
    }
    onChange({ type: "property", column: info.name });
    onClose();
  };

  if (query === undefined) {
    return <EmptyMessage>{t`Loading the people table…`}</EmptyMessage>;
  }
  return (
    <FilterColumnPicker
      query={query}
      stageIndexes={[STAGE]}
      checkItemIsSelected={(item) =>
        isSegmentListItem(item)
          ? pickedSegments.some(
              (picked) => picked.key === findSegmentRef(item)?.key,
            )
          : "column" in item &&
            value?.type === "property" &&
            item.name === value.column
      }
      onColumnSelect={handleColumnSelect}
      onSegmentSelect={handleSegmentSelect}
      withCustomExpression={false}
    />
  );
};

type PropertyOptionsProps = {
  columns: ColumnOption[];
  value: string | null;
  onChange: (column: string) => void;
};

/** Without a users table, the event table's properties, with a search box. */
const PropertyOptions = ({
  columns,
  value,
  onChange,
}: PropertyOptionsProps) => {
  const [searchText, setSearchText] = useState("");
  const matching = columns.filter((column) =>
    column.label.toLowerCase().includes(searchText.trim().toLowerCase()),
  );
  return (
    <Box w={DROPDOWN_WIDTH}>
      <ListSearchField
        autoFocus
        placeholder={t`Find...`}
        value={searchText}
        onChange={(event) => setSearchText(event.target.value)}
        onResetClick={() => setSearchText("")}
        p="sm"
      />
      <Box mah={MAX_DROPDOWN_HEIGHT} p="xs" style={{ overflowY: "auto" }}>
        {columns.length === 0 ? (
          <EmptyMessage>{t`No properties to break out by.`}</EmptyMessage>
        ) : matching.length === 0 ? (
          <EmptyMessage>{t`Didn't find any results`}</EmptyMessage>
        ) : (
          matching.map((column) => (
            <Menu.Item
              key={column.value}
              className={S.option}
              aria-selected={column.value === value}
              leftSection={<Icon name={column.icon} className={S.icon} />}
              onClick={() => onChange(column.value)}
            >
              {column.label}
            </Menu.Item>
          ))
        )}
      </Box>
    </Box>
  );
};

const EmptyMessage = ({ children }: { children: string }) => (
  <Text c="text-secondary" px="sm" py="xs">
    {children}
  </Text>
);
