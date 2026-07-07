import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, type ReactNode, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Group, Loader, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import type { ErroringQuestionsFilters } from "./types";

type ErroringQuestionsFilterBarProps = {
  hasLoader: boolean;
  onFiltersChange: (filters: Partial<ErroringQuestionsFilters>) => void;
};

export function ErroringQuestionsFilterBar({
  hasLoader,
  onFiltersChange,
}: ErroringQuestionsFilterBarProps) {
  return (
    <Group gap="md" align="center" wrap="wrap">
      <FilterInput
        flex={2}
        placeholder={t`Error contents`}
        rightSection={hasLoader ? <Loader size="sm" /> : undefined}
        onChange={(errorFilter) => onFiltersChange({ errorFilter })}
      />
      <FilterInput
        flex={1}
        placeholder={t`DB name`}
        onChange={(dbFilter) => onFiltersChange({ dbFilter })}
      />
      <FilterInput
        flex={1}
        placeholder={t`Collection name`}
        onChange={(collectionFilter) => onFiltersChange({ collectionFilter })}
      />
    </Group>
  );
}

type FilterInputProps = {
  flex: number;
  placeholder: string;
  rightSection?: ReactNode;
  onChange: (value: string) => void;
};

function FilterInput({
  flex,
  placeholder,
  rightSection,
  onChange,
}: FilterInputProps) {
  const [value, setValue] = useState("");
  const handleChangeDebounced = useDebouncedCallback(
    onChange,
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    handleChangeDebounced(event.target.value);
  };

  return (
    <TextInput
      value={value}
      placeholder={placeholder}
      flex={flex}
      miw="8rem"
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={rightSection}
      onChange={handleChange}
    />
  );
}
