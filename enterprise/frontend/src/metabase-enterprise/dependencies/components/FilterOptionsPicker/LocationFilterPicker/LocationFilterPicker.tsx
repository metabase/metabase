import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Checkbox, Input, Stack } from "metabase/ui";
import type { DependencyFilterOptions } from "metabase-types/api";

type LocationFilterPickerProps = {
  filters: DependencyFilterOptions;
  onFiltersChange: (filters: DependencyFilterOptions) => void;
};

export function LocationFilterPicker({
  filters,
  onFiltersChange,
}: LocationFilterPickerProps) {
  const { includePersonalCollections = true } = filters;

  const handleIncludeInPersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const newValue = event.target.checked;
    onFiltersChange({
      ...filters,
      includePersonalCollections: newValue,
    });
  };

  return (
    <Input.Wrapper label={t`Location`}>
      <Stack gap="sm" mt="sm">
        <Checkbox
          label={t`Include items in personal collections`}
          checked={includePersonalCollections}
          onChange={handleIncludeInPersonalCollectionsChange}
        />
      </Stack>
    </Input.Wrapper>
  );
}
