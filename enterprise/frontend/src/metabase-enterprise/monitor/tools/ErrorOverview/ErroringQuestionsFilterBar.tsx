import { useDebouncedCallback } from "@mantine/hooks";
import { type ChangeEvent, useState } from "react";
import { t } from "ttag";

import { FixedSizeIcon, Loader, TextInput } from "metabase/ui";
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
  const [value, setValue] = useState("");
  const handleChangeDebounced = useDebouncedCallback(
    (search: string) => onFiltersChange({ search }),
    SEARCH_DEBOUNCE_DURATION,
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
    handleChangeDebounced(event.target.value);
  };

  return (
    <TextInput
      value={value}
      placeholder={t`Search by question, error, database, or collection`}
      w="100%"
      leftSection={<FixedSizeIcon name="search" />}
      rightSection={hasLoader ? <Loader size="sm" /> : undefined}
      onChange={handleChange}
    />
  );
}
