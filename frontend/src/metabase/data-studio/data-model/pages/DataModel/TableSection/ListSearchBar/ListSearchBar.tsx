import type { ReactNode } from "react";

import { Group, Icon, Input, Text, TextInput } from "metabase/ui";

interface ListSearchBarProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  /** `page` matches the Segments tab's full-size search on a page */
  variant?: "compact" | "page";
  /** Action buttons, to the right of the input like the table list's filter */
  children?: ReactNode;
}

/** Search input with the list's actions beside it, like the top of the table list */
export function ListSearchBar({
  value,
  placeholder,
  disabled,
  onChange,
  variant = "compact",
  children,
}: ListSearchBarProps) {
  if (variant === "page") {
    return (
      <Group gap="lg" wrap="nowrap">
        <TextInput
          flex="1"
          miw={0}
          bdrs="sm"
          leftSection={<Icon name="search" />}
          placeholder={placeholder}
          aria-label={placeholder}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        {children}
      </Group>
    );
  }
  return (
    <Group gap="sm" wrap="nowrap">
      <Input
        flex="1"
        miw={0}
        size="xs"
        leftSection={<Icon name="search" />}
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {children}
    </Group>
  );
}

/** Case-insensitive match on any of the item's names */
export function matchesListSearch(
  query: string,
  ...names: (string | null | undefined)[]
): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return (
    normalizedQuery === "" ||
    names.some((name) => name?.toLowerCase().includes(normalizedQuery))
  );
}

/** Shown in place of the list when nothing matches the search */
export function ListSearchEmptyState({ children }: { children: ReactNode }) {
  return (
    <Text c="text-secondary" ta="center" py="xl">
      {children}
    </Text>
  );
}
