import { useState } from "react";
import { t } from "ttag";

import {
  Box,
  Flex,
  Icon,
  SegmentedControl,
  Select,
  type SelectProps,
  Stack,
  Text,
  rem,
} from "metabase/ui";

import { getStandInHint } from "./GroupPreviewInfo";
import type { Principal, PrincipalType } from "./api";
import {
  type PrincipalRow,
  type PrincipalSection,
  matchesPrincipalSearch,
  usePrincipalSections,
} from "./principal-sections";
import { isPrincipalType } from "./urls";

type PrincipalPickerProps = {
  value: Principal | null;
  onChange: (principal: Principal | null) => void;
};

type OptionsFilter = NonNullable<SelectProps["filter"]>;

/**
 * Picks a user or a group, with the same rows and sections as the Preview sidebar.
 */
export function PrincipalPicker({ value, onChange }: PrincipalPickerProps) {
  const [isOpened, setIsOpened] = useState(false);
  const type = value?.type ?? "user";
  const { sections } = usePrincipalSections(type);
  const rowsByValue = new Map(
    sections.flatMap((section) =>
      section.rows.map((row) => [String(row.id), row] as const),
    ),
  );
  const selectedRow = value ? rowsByValue.get(String(value.id)) : undefined;

  const typeOptions = [
    { value: "user", label: t`User` },
    { value: "group", label: t`Group` },
  ];

  const filter: OptionsFilter = ({ options, search }) => {
    const matches = (optionValue: string) => {
      const row = rowsByValue.get(optionValue);
      return row != null && matchesPrincipalSearch(row, search);
    };
    return (
      options
        .map((option) =>
          "group" in option
            ? {
                ...option,
                items: option.items.filter((item) => matches(item.value)),
              }
            : option,
        )
        // an emptied group is dropped too, so a search that matches no one says so
        .filter((option) =>
          "group" in option ? option.items.length > 0 : matches(option.value),
        )
    );
  };

  return (
    <Stack gap="sm">
      <SegmentedControl
        aria-label={t`Preview as`}
        data={typeOptions}
        value={type}
        onChange={(newType) => {
          if (isPrincipalType(newType)) {
            onChange({ type: newType, id: 0 });
          }
        }}
      />
      <Select
        aria-label={t`Who to preview`}
        placeholder={getPlaceholder(type)}
        description={type !== "user" ? getStandInHint() : undefined}
        searchable
        // a searchable Select only opens on click; this makes a second click close it
        openOnFocus={false}
        dropdownOpened={isOpened}
        onDropdownOpen={() => setIsOpened(true)}
        onDropdownClose={() => setIsOpened(false)}
        onClick={() => isOpened && setIsOpened(false)}
        data={getSelectData(sections)}
        // the list is long, so it opens down into the modal instead of flipping above the field, short enough to fit
        // under the field in a 900px-tall window
        comboboxProps={{ position: "bottom", middlewares: { flip: false } }}
        styles={{ options: { maxHeight: rem(320) } }}
        filter={filter}
        nothingFoundMessage={t`No results found`}
        leftSection={<Icon name={selectedRow?.icon ?? getTypeIcon(type)} />}
        renderOption={({ option }) => {
          const row = rowsByValue.get(option.value);
          return row ? <PrincipalOption row={row} /> : option.label;
        }}
        value={value && value.id > 0 ? String(value.id) : null}
        onChange={(id) =>
          onChange(id == null ? null : { type, id: Number(id) })
        }
      />
    </Stack>
  );
}

function getSelectData(sections: PrincipalSection[]) {
  const toOption = (row: PrincipalRow) => ({
    value: String(row.id),
    label: row.name,
  });
  const hasTitles = sections.some((section) => section.title != null);
  return hasTitles
    ? sections.map((section) => ({
        group: section.title ?? "",
        items: section.rows.map(toOption),
      }))
    : sections.flatMap((section) => section.rows.map(toOption));
}

function PrincipalOption({ row }: { row: PrincipalRow }) {
  return (
    <Flex align="center" gap="sm" w="100%" mih="2.75rem">
      <Icon name={row.icon} />
      <Box flex={1} miw={0}>
        <Text truncate>{row.name}</Text>
        {row.secondary && (
          <Text size="sm" c="text-secondary" truncate>
            {row.secondary}
          </Text>
        )}
      </Box>
      {row.detail && (
        <Text size="sm" c="text-secondary">
          {row.detail}
        </Text>
      )}
    </Flex>
  );
}

function getTypeIcon(type: PrincipalType) {
  switch (type) {
    case "user":
      return "person";
    case "group":
      return "group";
  }
}

function getPlaceholder(type: PrincipalType) {
  switch (type) {
    case "user":
      return t`Search for a user`;
    case "group":
      return t`Search for a group`;
  }
}
