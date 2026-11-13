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
} from "metabase/ui";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import type { Principal, PrincipalType } from "./api";
import { isPrincipalType } from "./preview/urls";
import {
  type PrincipalRow,
  type PrincipalSection,
  matchesPrincipalSearch,
  usePrincipalSections,
} from "./principal-sections";

type PrincipalPickerProps = {
  value: Principal | null;
  onChange: (principal: Principal | null) => void;
};

type OptionsFilter = NonNullable<SelectProps["filter"]>;

/**
 * Picks a user, a group or a tenant, with the same rows and sections as the Preview sidebar.
 */
export function PrincipalPicker({ value, onChange }: PrincipalPickerProps) {
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
    ...(hasPremiumFeature("tenants")
      ? [{ value: "tenant", label: t`Tenant` }]
      : []),
  ];

  const filter: OptionsFilter = ({ options, search }) => {
    const matches = (optionValue: string) => {
      const row = rowsByValue.get(optionValue);
      return row != null && matchesPrincipalSearch(row, search);
    };
    return options
      .map((option) =>
        "group" in option
          ? {
              ...option,
              items: option.items.filter((item) => matches(item.value)),
            }
          : option,
      )
      .filter((option) => "group" in option || matches(option.value));
  };

  return (
    <Stack gap="sm">
      <SegmentedControl
        data={typeOptions}
        value={type}
        onChange={(newType) => {
          if (isPrincipalType(newType)) {
            onChange({ type: newType, id: 0 });
          }
        }}
      />
      <Select
        aria-label={t`Who`}
        placeholder={getPlaceholder(type)}
        searchable
        data={getSelectData(sections)}
        filter={filter}
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
    <Flex align="center" gap="sm" w="100%">
      <Icon name={row.icon} />
      <Box flex={1} miw={0}>
        <Text fw={700} truncate>
          {row.name}
        </Text>
        {row.email && (
          <Text fz="sm" c="text-secondary" truncate>
            {row.email}
          </Text>
        )}
      </Box>
      {row.detail && (
        <Text fz="sm" c="text-secondary">
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
    case "tenant":
      return "globe";
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
