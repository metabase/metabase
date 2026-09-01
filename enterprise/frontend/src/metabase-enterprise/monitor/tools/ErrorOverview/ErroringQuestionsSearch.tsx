import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";

import type { ErroringQuestionsFilters } from "./types";

type ErroringQuestionsSearchProps = {
  onFiltersChange: (filters: Partial<ErroringQuestionsFilters>) => void;
};

export function ErroringQuestionsSearch({
  onFiltersChange,
}: ErroringQuestionsSearchProps) {
  const [value, setValue] = useState("");
  const handleChangeDebounced = useDebouncedCallback(
    (search: string) => onFiltersChange({ search }),
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    handleChangeDebounced(event.target.value);
  };

  const searchLabel = t`Search by question, error, database, or collection`;

  return (
    <TextInput
      value={value}
      aria-label={searchLabel}
      placeholder={searchLabel}
      w="100%"
      leftSection={<FixedSizeIcon name="search" />}
      onChange={handleChange}
    />
  );
}
