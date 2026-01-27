import type { ChangeEvent } from "react";
import { t } from "ttag";

import { Checkbox, Input, Stack } from "metabase/ui";

import type { DependencyFilterOptions } from "../../../types";

type LocationFilterPickerProps = {
  filterOptions: DependencyFilterOptions;
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function LocationFilterPicker({
  filterOptions,
  onFilterOptionsChange,
}: LocationFilterPickerProps) {
  const { includePersonalCollections } = filterOptions;

  const handleIncludeInPersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const newValue = event.target.checked;
    onFilterOptionsChange({
      ...filterOptions,
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
