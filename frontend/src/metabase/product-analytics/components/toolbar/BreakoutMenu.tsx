import { useState } from "react";
import { msgid, ngettext, t } from "ttag";

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

const MAX_DROPDOWN_HEIGHT = "60vh";
const DROPDOWN_WIDTH = 280;

/** Rests in the default button's hover gray, like a pressed Setup, and hovers darker. */
const BREAKOUT_SET_VARS = {
  root: {
    "--button-bg": "var(--mb-color-button-default-neutral-hover)",
    "--button-hover": "var(--mb-color-button-default-neutral-pressed)",
    "--button-pressed": "var(--mb-color-button-default-neutral-pressed)",
  },
};

type ColumnOption = { value: string; label: string; icon: IconName };

type BreakoutTab = Breakout["type"];

type BreakoutMenuProps = SettingWidgetProps<Breakout | null> & {
  columns?: ColumnOption[];
  /** Undefined while no users table is linked; cohorts live on it. */
  usersTableId?: TableId;
};

/** "By Country", the one cohort's name, or "2 Cohorts"; null while unset. */
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
        : ngettext(msgid`${count} Cohort`, `${count} Cohorts`, count);
    }
  }
};

/**
 * An icon button in the toolbar's button group, labeled while set. Its menu
 * breaks out by a property or by cohorts, one or the other: picking from the
 * other tab replaces the breakout.
 */
export const BreakoutMenu = ({
  value,
  onChange,
  columns = [],
  usersTableId,
}: BreakoutMenuProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const label = getButtonLabel(value, columns);
  const isSet = label !== null;
  const canBreakOut = columns.length > 0 || usersTableId !== undefined;

  return (
    <Menu position="bottom-start" opened={isOpen} onChange={setIsOpen}>
      <Menu.Target>
        <Tooltip label={t`Break out`} disabled={isOpen || isSet}>
          <Button
            variant="default"
            px={isSet ? undefined : "sm"}
            vars={isSet ? () => BREAKOUT_SET_VARS : undefined}
            leftSection={isSet ? <Icon name="split_branch" /> : undefined}
            aria-label={isSet ? undefined : t`Break out`}
            aria-pressed={isSet}
            disabled={!canBreakOut}
          >
            {label ?? <Icon name="split_branch" />}
          </Button>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown w={DROPDOWN_WIDTH}>
        <Tabs defaultValue={value?.type ?? "property"}>
          <Tabs.List grow>
            <Tabs.Tab value={"property" satisfies BreakoutTab}>
              {t`Properties`}
            </Tabs.Tab>
            <Tabs.Tab value={"cohorts" satisfies BreakoutTab}>
              {t`People segments`}
            </Tabs.Tab>
          </Tabs.List>
          <Box mah={MAX_DROPDOWN_HEIGHT} pt="xs" style={{ overflowY: "auto" }}>
            <Tabs.Panel value={"property" satisfies BreakoutTab}>
              <PropertyOptions
                columns={columns}
                value={value?.type === "property" ? value.column : null}
                onChange={(column) => onChange({ type: "property", column })}
              />
            </Tabs.Panel>
            <Tabs.Panel value={"cohorts" satisfies BreakoutTab}>
              {usersTableId !== undefined ? (
                <CohortOptions
                  usersTableId={usersTableId}
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
        {/* Below the options, so it appearing doesn't move them. */}
        {isSet && (
          <>
            <Menu.Divider />
            <Menu.Item
              leftSection={<Icon name="close" />}
              onClick={() => onChange(null)}
            >
              {t`Remove breakout`}
            </Menu.Item>
          </>
        )}
      </Menu.Dropdown>
    </Menu>
  );
};

type PropertyOptionsProps = {
  columns: ColumnOption[];
  value: string | null;
  onChange: (column: string) => void;
};

const PropertyOptions = ({ columns, value, onChange }: PropertyOptionsProps) =>
  columns.length > 0 ? (
    <>
      {columns.map((column) => (
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
  ) : (
    <EmptyMessage>{t`No properties to break out by.`}</EmptyMessage>
  );

type CohortOptionsProps = {
  usersTableId: TableId;
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
  return (
    <>
      {segments.map((segment) => (
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
