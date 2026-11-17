import { type KeyboardEvent, useEffect, useId, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { EmptyState } from "metabase/common/components/EmptyState";
import {
  Box,
  Flex,
  Icon,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { StandInHint } from "./GroupPreviewInfo";
import type { Principal, PrincipalType } from "./api";
import {
  type PrincipalRow,
  type PrincipalSection,
  matchesPrincipalSearch,
  usePreviewPrincipalSections,
} from "./principal-sections";
import { isPrincipalType } from "./urls";

type PrincipalListProps = {
  principal: Principal;
  onPrincipalChange: (principal: Principal) => void;
};

/**
 * The "View app as…" panel's list of who to view as: a narrower take on the Preview sidebar, since the panel takes
 * width from the app being previewed. The list is one Tab stop: ↑ and ↓ move between rows, Enter or Space picks one.
 */
export function PrincipalList({
  principal,
  onPrincipalChange,
}: PrincipalListProps) {
  const [type, setType] = useState<PrincipalType>(principal.type);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isListFocused, setIsListFocused] = useState(false);
  const listId = useId();
  const sections: PrincipalSection[] =
    usePreviewPrincipalSections(type).sections;
  const visibleSections = sections
    .map((section) => ({
      ...section,
      rows: section.rows.filter((row) => matchesPrincipalSearch(row, search)),
    }))
    .filter((section) => section.rows.length > 0);
  const rows = visibleSections.flatMap((section) => section.rows);
  const hasNoResults = search.trim() !== "" && rows.length === 0;
  const isSelected = (row: PrincipalRow) =>
    type === principal.type && row.id === principal.id;
  const activeRow =
    rows.find((row) => row.id === activeId) ?? rows.find(isSelected) ?? rows[0];
  const getOptionId = (row: PrincipalRow) => `${listId}-${row.id}`;
  const activeOptionId = activeRow != null ? getOptionId(activeRow) : undefined;

  useEffect(() => {
    if (activeOptionId != null) {
      document
        .getElementById(activeOptionId)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeOptionId]);

  const typeOptions = [
    { value: "user", label: t`User` },
    { value: "group", label: t`Group` },
    ...(hasPremiumFeature("tenants")
      ? [{ value: "tenant", label: t`Tenant` }]
      : []),
  ];

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (activeRow == null) {
      return;
    }
    const activeIndex = rows.indexOf(activeRow);
    const nextRow = match(event.key)
      .with("ArrowDown", () => rows[Math.min(activeIndex + 1, rows.length - 1)])
      .with("ArrowUp", () => rows[Math.max(activeIndex - 1, 0)])
      .with("Home", () => rows[0])
      .with("End", () => rows[rows.length - 1])
      .otherwise(() => null);
    if (nextRow != null) {
      event.preventDefault();
      setActiveId(nextRow.id);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onPrincipalChange({ type, id: activeRow.id });
    }
  };

  return (
    <Stack gap="sm" px="sm" pb="sm" mih={0} flex={1}>
      <SegmentedControl
        fullWidth
        aria-label={t`Preview as`}
        data={typeOptions}
        value={type}
        onChange={(value) => {
          if (isPrincipalType(value)) {
            setType(value);
            setSearch("");
            setActiveId(null);
          }
        }}
      />
      <TextInput
        size="xs"
        aria-label={t`Search`}
        placeholder={getPlaceholder(type)}
        leftSection={<Icon name="search" />}
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setActiveId(null);
        }}
      />
      {type !== "user" && <StandInHint type={type} />}
      {hasNoResults && (
        <Box py="xl">
          <EmptyState message={t`No results found`} icon="search" />
        </Box>
      )}
      <Box
        role="listbox"
        aria-label={getListName(type)}
        aria-activedescendant={activeOptionId}
        tabIndex={0}
        flex={1}
        mih={0}
        p={4}
        style={{ overflowY: "auto", outline: "none" }}
        onKeyDown={handleListKeyDown}
        onFocus={() => setIsListFocused(true)}
        onBlur={() => setIsListFocused(false)}
      >
        {visibleSections.map((section, index) => {
          const titleId = `${listId}-section-${index}`;
          return (
            <Box
              key={section.title ?? index}
              role="group"
              aria-labelledby={section.title != null ? titleId : undefined}
            >
              {section.title != null && (
                <Text
                  id={titleId}
                  fz="xs"
                  c="text-secondary"
                  px="xs"
                  pt="sm"
                  pb={4}
                >
                  {section.title}
                </Text>
              )}
              {section.rows.map((row) => (
                <PrincipalListRow
                  key={row.id}
                  id={getOptionId(row)}
                  row={row}
                  isSelected={isSelected(row)}
                  isActive={isListFocused && row === activeRow}
                  onClick={() => {
                    setActiveId(row.id);
                    onPrincipalChange({ type, id: row.id });
                  }}
                />
              ))}
            </Box>
          );
        })}
      </Box>
    </Stack>
  );
}

type PrincipalListRowProps = {
  id: string;
  row: PrincipalRow;
  isSelected: boolean;
  /** The row ↑ and ↓ are on, while the list has keyboard focus. */
  isActive: boolean;
  onClick: () => void;
};

function PrincipalListRow({
  id,
  row,
  isSelected,
  isActive,
  onClick,
}: PrincipalListRowProps) {
  const color = isSelected ? "text-primary-inverse" : undefined;

  return (
    <Box
      id={id}
      role="option"
      aria-selected={isSelected}
      w="100%"
      px="xs"
      py={6}
      bg={isSelected ? "core-brand" : undefined}
      style={{
        borderRadius: "var(--mantine-radius-sm)",
        cursor: "pointer",
        outline: isActive ? "2px solid var(--mb-color-core-brand)" : undefined,
        // outside the row, so it also shows on the selected row
        outlineOffset: isActive ? 1 : undefined,
      }}
      onClick={onClick}
    >
      <Flex align="center" gap="sm">
        <Icon name={row.icon} c={color ?? "text-secondary"} />
        <Box miw={0} flex={1}>
          <Text c={color} truncate>
            {row.name}
          </Text>
          {row.secondary != null && (
            <Text fz="xs" c={color ?? "text-secondary"} truncate>
              {row.secondary}
            </Text>
          )}
        </Box>
        {row.detail != null && (
          <Text fz="sm" c={color ?? "text-secondary"} style={{ flexShrink: 0 }}>
            {row.detail}
          </Text>
        )}
      </Flex>
    </Box>
  );
}

function getListName(type: PrincipalType) {
  switch (type) {
    case "user":
      return t`Users`;
    case "group":
      return t`Groups`;
    case "tenant":
      return t`Tenants`;
  }
}

function getPlaceholder(type: PrincipalType) {
  switch (type) {
    case "user":
      return t`Search for a user`;
    case "group":
      return t`Search for a group`;
    case "tenant":
      return t`Search for a tenant`;
  }
}
