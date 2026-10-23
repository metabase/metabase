import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

import { ListSearchField } from "metabase/common/components/ListSearchField";
import {
  Box,
  Button,
  Checkbox,
  Icon,
  Loader,
  Menu,
  Tabs,
  Text,
  Tooltip,
} from "metabase/ui";
import type { IconName, TableId } from "metabase-types/api";

import type { Breakout } from "../../analyses/breakout";
import { toPeopleSegmentRef } from "../../segments/people-segment-ref";
import type { PaletteSegment, PeopleSegmentRef } from "../../segments/types";
import { usePaletteSegments } from "../../segments/use-palette-segments";
import { useSegmentDrafts } from "../../segments/use-segment-drafts";
import type { SettingWidgetProps } from "../../settings/types";

import S from "./BreakoutMenu.module.css";

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

type BreakoutTab = Breakout["type"];

type BreakoutMenuProps = SettingWidgetProps<Breakout | null> & {
  columns?: ColumnOption[];
  /** Undefined while no users table is linked; cohorts live on it. */
  usersTableId?: TableId;
};

/** "By Country", the one segment's name, or "2 Segments"; null while unset. */
const getButtonLabel = (
  value: Breakout | null,
  columns: ColumnOption[],
): string | null => {
  switch (value?.type) {
    case undefined:
      return null;
    case "property": {
      const column = columns.find((option) => option.value === value.column);
      return column !== undefined ? t`By ${column.label}` : null;
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
 * button beside it that clears the breakout. Its menu breaks out by a
 * property or by people segments, one or the other: picking from the other
 * tab replaces the breakout. A search box above the tabs narrows both.
 */
export const BreakoutMenu = ({
  value,
  onChange,
  columns = [],
  usersTableId,
}: BreakoutMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const label = getButtonLabel(value, columns);
  const isSet = label !== null;
  const canBreakOut = columns.length > 0 || usersTableId !== undefined;

  const handleOpenChange = (isOpening: boolean) => {
    setIsOpen(isOpening);
    if (!isOpening) {
      setSearchText("");
    }
  };

  return (
    // Siblings in the toolbar's button group, so the clear button joins the
    // label without a button inside a button.
    <>
      <Menu position="bottom-start" opened={isOpen} onChange={handleOpenChange}>
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
        {/* Spaced like the filter picker: the search field pads itself. */}
        <Menu.Dropdown w={DROPDOWN_WIDTH} p={0}>
          <ListSearchField
            autoFocus
            placeholder={t`Find...`}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            onResetClick={() => setSearchText("")}
            p="sm"
          />
          <Tabs defaultValue={value?.type ?? "property"}>
            <Tabs.List className={S.tabList} grow>
              <Tabs.Tab value={"property" satisfies BreakoutTab}>
                {t`Properties`}
              </Tabs.Tab>
              <Tabs.Tab value={"cohorts" satisfies BreakoutTab}>
                {t`People segments`}
              </Tabs.Tab>
            </Tabs.List>
            <Box mah={MAX_DROPDOWN_HEIGHT} p="xs" style={{ overflowY: "auto" }}>
              <Tabs.Panel value={"property" satisfies BreakoutTab}>
                <PropertyOptions
                  columns={columns}
                  searchText={searchText}
                  value={value?.type === "property" ? value.column : null}
                  onChange={(column) => onChange({ type: "property", column })}
                />
              </Tabs.Panel>
              <Tabs.Panel value={"cohorts" satisfies BreakoutTab}>
                {usersTableId !== undefined ? (
                  <CohortOptions
                    usersTableId={usersTableId}
                    searchText={searchText}
                    value={value?.type === "cohorts" ? value.segments : []}
                    onChange={(segments) =>
                      onChange(
                        segments.length > 0
                          ? { type: "cohorts", segments }
                          : null,
                      )
                    }
                  />
                ) : (
                  <EmptyMessage>
                    {t`Link a Customers or Users table to the person column first.`}
                  </EmptyMessage>
                )}
              </Tabs.Panel>
            </Box>
          </Tabs>
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

/** Whether a name has the search text in it, ignoring case. */
const matchesSearch = (name: string, searchText: string) =>
  name.toLowerCase().includes(searchText.trim().toLowerCase());

const getNoResultsMessage = () => t`Didn't find any results`;

type PropertyOptionsProps = {
  columns: ColumnOption[];
  searchText: string;
  value: string | null;
  onChange: (column: string) => void;
};

const PropertyOptions = ({
  columns,
  searchText,
  value,
  onChange,
}: PropertyOptionsProps) => {
  const matching = columns.filter((column) =>
    matchesSearch(column.label, searchText),
  );
  if (columns.length === 0) {
    return <EmptyMessage>{t`No properties to break out by.`}</EmptyMessage>;
  }
  if (matching.length === 0) {
    return <EmptyMessage>{getNoResultsMessage()}</EmptyMessage>;
  }
  return (
    <>
      {matching.map((column) => (
        <Menu.Item
          key={column.value}
          className={S.option}
          aria-selected={column.value === value}
          leftSection={<Icon name={column.icon} className={S.icon} />}
          onClick={() => onChange(column.value)}
        >
          {column.label}
        </Menu.Item>
      ))}
    </>
  );
};

type CohortOptionsProps = {
  usersTableId: TableId;
  searchText: string;
  value: PeopleSegmentRef[];
  onChange: (segments: PeopleSegmentRef[]) => void;
};

/**
 * The users table's segments and this session's drafts, with checkboxes that
 * keep the menu open. Mounted with the dropdown, so drafts made since the
 * last time it opened show up.
 */
const CohortOptions = ({
  usersTableId,
  searchText,
  value,
  onChange,
}: CohortOptionsProps) => {
  const { drafts } = useSegmentDrafts(usersTableId);
  const { saved, drafted, isLoading } = usePaletteSegments(
    usersTableId,
    "people",
    drafts,
  );
  const segments: PaletteSegment[] = [...saved, ...drafted];

  const toggle = (segment: PaletteSegment) => {
    const isPicked = value.some((picked) => picked.key === segment.key);
    if (isPicked) {
      onChange(value.filter((picked) => picked.key !== segment.key));
      return;
    }
    const ref = toPeopleSegmentRef(segment);
    if (ref !== undefined) {
      onChange([...value, ref]);
    }
  };

  if (isLoading) {
    return (
      <Box ta="center" py="sm">
        <Loader size="xs" />
      </Box>
    );
  }
  if (segments.length === 0) {
    return (
      <EmptyMessage>{t`No segments on the people table yet.`}</EmptyMessage>
    );
  }
  const matching = segments.filter((segment) =>
    matchesSearch(segment.name, searchText),
  );
  if (matching.length === 0) {
    return <EmptyMessage>{getNoResultsMessage()}</EmptyMessage>;
  }
  return (
    <>
      {matching.map((segment) => (
        <Menu.Item
          key={segment.key}
          closeMenuOnClick={false}
          leftSection={<Icon name="segment" className={S.segmentIcon} />}
          rightSection={
            <Checkbox
              checked={value.some((picked) => picked.key === segment.key)}
              readOnly
              tabIndex={-1}
              style={{ pointerEvents: "none" }}
            />
          }
          onClick={() => toggle(segment)}
        >
          {segment.name}
        </Menu.Item>
      ))}
    </>
  );
};

const EmptyMessage = ({ children }: { children: string }) => (
  <Text c="text-secondary" px="sm" py="xs">
    {children}
  </Text>
);
