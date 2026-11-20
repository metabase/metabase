import { useLayoutEffect, useRef, useState } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  Box,
  Group,
  Icon,
  Popover,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "metabase/ui";

import type {
  AffectingAttribute,
  AttributeRuleKind,
  AttributeUse,
} from "../api";
import { formatList } from "../format-list";

type AttributeBarProps = {
  attributes: AffectingAttribute[];
  isLoading: boolean;
  /** The values picked for the group's preview. */
  pickedValues: Record<string, string>;
  onPick: (attribute: string, value: string) => void;
  /** "User attributes used by rules:" above the chips, for a narrow panel. */
  isLabelOnOwnRow?: boolean;
  /** The group's size, so its chips say how many members share the value: "Gadget · 2 of 7 members". */
  groupMemberCount?: number | null;
};

/**
 * The attributes that a permission rule reads, for a group's preview, as chips under the band; each opens its picker
 * and says where it's used. Nothing when no rule reads any: the others can't change what the preview shows.
 */
export function AttributeBar({
  attributes,
  isLoading,
  pickedValues,
  onPick,
  isLabelOnOwnRow = false,
  groupMemberCount,
}: AttributeBarProps) {
  const ruleAttributes = getRuleAttributes(attributes);
  if (!isLoading && ruleAttributes.length === 0) {
    return null;
  }
  // nothing beside the label until they load
  const label = !isLoading && (
    <Text c="text-secondary">{t`User attributes used by rules:`}</Text>
  );

  return (
    <Stack gap="sm">
      {isLabelOnOwnRow && label}
      <Group
        gap="sm"
        aria-label={t`User attributes used by rules`}
        role="toolbar"
        wrap="wrap"
        mih="1.75rem"
      >
        {!isLabelOnOwnRow && label}
        {ruleAttributes.map((attribute) => (
          <AttributeChip
            key={attribute.attribute}
            attribute={attribute}
            pickedValue={pickedValues[attribute.attribute]}
            groupMemberCount={groupMemberCount}
            onPick={(value) => onPick(attribute.attribute, value)}
          />
        ))}
      </Group>
    </Stack>
  );
}

/** The attributes a permission rule on the person's groups reads; only these can change what the preview shows. */
export function getRuleAttributes(attributes: AffectingAttribute[]) {
  return attributes.filter((attribute) => attribute.uses.length > 0);
}

type AttributeChipProps = {
  attribute: AffectingAttribute;
  pickedValue: string | undefined;
  groupMemberCount?: number | null;
  onPick: (value: string) => void;
};

function AttributeChip({
  attribute,
  pickedValue,
  groupMemberCount,
  onPick,
}: AttributeChipProps) {
  const [isOpened, setIsOpened] = useState(false);
  const value = pickedValue ?? attribute.value ?? "";

  const handlePick = (newValue: string) => {
    setIsOpened(false);
    onPick(newValue);
  };

  return (
    <Popover opened={isOpened} onChange={setIsOpened} position="bottom-start">
      <Popover.Target>
        {/* a chip, not a link: bordered, the same on every page */}
        <UnstyledButton
          px="sm"
          h="1.5rem"
          maw="100%"
          bg="background_page-primary"
          c="text-primary"
          style={CHIP_BORDER}
          onClick={() => setIsOpened((opened) => !opened)}
        >
          <Group gap="xxs" wrap="nowrap" h="100%">
            <Text fw="bold" c="inherit">
              {attribute.attribute}
            </Text>
            <Text c="inherit" truncate>
              {value === "" ? t`No value` : value}
            </Text>
            {groupMemberCount != null && (
              <Text c="text-secondary" style={{ whiteSpace: "nowrap" }}>
                {`· ${getMemberShare(attribute, value, groupMemberCount)}`}
              </Text>
            )}
            <Icon name="chevrondown" size={12} ml="xxs" c="text-secondary" />
          </Group>
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p="md" w="22rem">
        <Stack gap="sm">
          <Text fw="bold">{attribute.attribute}</Text>
          <AttributePicker
            attribute={attribute}
            value={value}
            onPick={handlePick}
          />
          {getUseLines(attribute.uses).map((line) => (
            <Text key={line} c="text-secondary">
              {line}
            </Text>
          ))}
        </Stack>
      </Popover.Dropdown>
    </Popover>
  );
}

/** "2 of 7 members": how many of the group's members have the value. */
function getMemberShare(
  attribute: AffectingAttribute,
  value: string,
  memberCount: number,
) {
  const count =
    attribute.member_values?.find((memberValue) => memberValue.value === value)
      ?.count ?? 0;
  return ngettext(
    msgid`${count} of ${memberCount} member`,
    `${count} of ${memberCount} members`,
    memberCount,
  );
}

const CHIP_BORDER = {
  border: "1px solid var(--mb-color-border-neutral)",
  borderRadius: "var(--mantine-radius-xl)",
};

type AttributeTagProps = {
  attribute: string;
  /** The value, or the words for none, such as "each member's own". */
  value: string;
};

/** The same chip as the attribute bar's, read-only: "category Gizmo". */
export function AttributeTag({ attribute, value }: AttributeTagProps) {
  return (
    <Group
      gap="xxs"
      wrap="nowrap"
      px="sm"
      h="1.5rem"
      maw="100%"
      miw={0}
      bg="background_page-primary"
      c="text-primary"
      style={CHIP_BORDER}
    >
      <Text fw="bold" c="inherit" style={{ whiteSpace: "nowrap" }}>
        {attribute}
      </Text>
      <Text c="inherit" truncate>
        {value}
      </Text>
    </Group>
  );
}

/**
 * Where the person's rules read the attribute, whatever page is open: "Used by row and column security on Orders and
 * Products", one line per kind of rule.
 */
function getUseLines(uses: AttributeUse[]) {
  const labelsOf = (kind: AttributeRuleKind) =>
    _.uniq(uses.filter((use) => use.kind === kind).map((use) => use.label));
  const sandboxTables = labelsOf("sandbox");
  const impersonatedDatabases = labelsOf("impersonation");
  const routedDatabases = labelsOf("routing");
  return [
    sandboxTables.length > 0 &&
      t`Used by row and column security on ${formatList(sandboxTables)}`,
    impersonatedDatabases.length > 0 &&
      t`Used by connection impersonation on ${formatList(impersonatedDatabases)}`,
    routedDatabases.length > 0 &&
      t`Used by database routing on ${formatList(routedDatabases)}`,
  ].filter((line): line is string => typeof line === "string");
}

type AttributePickerProps = {
  attribute: AffectingAttribute;
  value: string;
  onPick: (value: string) => void;
};

/** The values the backend lists for the attribute (members' first, with their count), or free text when it lists none. */
function AttributePicker({ attribute, value, onPick }: AttributePickerProps) {
  const memberValues = attribute.member_values ?? [];
  const otherValues = attribute.other_values ?? [];
  return memberValues.length > 0 || otherValues.length > 0 ? (
    <ValueList
      attribute={attribute}
      value={value}
      memberValues={memberValues}
      otherValues={otherValues}
      onPick={onPick}
    />
  ) : (
    <TextValuePicker attribute={attribute} value={value} onPick={onPick} />
  );
}

type ValueListProps = AttributePickerProps & {
  memberValues: { value: string; count: number }[];
  otherValues: string[];
};

/** A searchable list in the popover itself, so nothing opens on top of it; a click picks. */
function ValueList({
  attribute,
  value,
  memberValues,
  otherValues,
  onPick,
}: ValueListProps) {
  const [search, setSearch] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    // opens on the current value, which can be far down a long list (TX for state)
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list != null && selected != null) {
      list.scrollTop =
        selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
    }
  }, []);
  const matches = (candidate: string) =>
    candidate.toLowerCase().includes(search.trim().toLowerCase());
  const memberSet = new Set(
    memberValues.map((memberValue) => memberValue.value),
  );
  const shownMembers = memberValues.filter((memberValue) =>
    matches(memberValue.value),
  );
  const shownOthers = otherValues.filter(
    (otherValue) => !memberSet.has(otherValue) && matches(otherValue),
  );

  return (
    <Stack gap="xs">
      <TextInput
        size="xs"
        aria-label={attribute.attribute}
        placeholder={t`Search the values`}
        leftSection={<Icon name="search" />}
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        autoFocus
      />
      <Box
        ref={listRef}
        role="listbox"
        aria-label={t`Values of ${attribute.attribute}`}
        mah="20rem"
        pos="relative"
        style={{ overflowY: "auto" }}
      >
        {shownMembers.length > 0 && (
          <ValueListHeading>{t`Members' values`}</ValueListHeading>
        )}
        {shownMembers.map((memberValue) => (
          <ValueListRow
            key={memberValue.value}
            label={memberValue.value}
            detail={getMemberCount(memberValue.count)}
            isSelected={memberValue.value === value}
            onClick={() => onPick(memberValue.value)}
          />
        ))}
        {shownMembers.length > 0 && shownOthers.length > 0 && (
          <ValueListHeading>{t`Other values`}</ValueListHeading>
        )}
        {shownOthers.map((otherValue) => (
          <ValueListRow
            key={otherValue}
            label={otherValue}
            isSelected={otherValue === value}
            onClick={() => onPick(otherValue)}
          />
        ))}
        {matches(t`No value`) && (
          <ValueListRow
            label={t`No value`}
            isSelected={value === ""}
            onClick={() => onPick("")}
          />
        )}
      </Box>
    </Stack>
  );
}

function ValueListHeading({ children }: { children: string }) {
  return (
    <Text size="sm" c="text-secondary" px="sm" pt="sm" pb="xs">
      {children}
    </Text>
  );
}

function ValueListRow({
  label,
  detail,
  isSelected,
  onClick,
}: {
  label: string;
  detail?: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      role="option"
      aria-selected={isSelected}
      w="100%"
      px="sm"
      py="xs"
      bg={isSelected ? "core-brand" : undefined}
      style={{ borderRadius: "var(--mantine-radius-sm)" }}
      onClick={onClick}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Text c={isSelected ? "text-primary-inverse" : undefined} truncate>
          {label}
        </Text>
        {detail != null && (
          <Text
            size="sm"
            c={isSelected ? "text-primary-inverse" : "text-secondary"}
          >
            {detail}
          </Text>
        )}
      </Group>
    </UnstyledButton>
  );
}

function getMemberCount(count: number) {
  return ngettext(msgid`${count} member`, `${count} members`, count);
}

function TextValuePicker({ attribute, value, onPick }: AttributePickerProps) {
  const [text, setText] = useState(value);
  const commit = () => text !== value && onPick(text);

  return (
    <TextInput
      size="xs"
      aria-label={attribute.attribute}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => event.key === "Enter" && commit()}
      onBlur={commit}
    />
  );
}
