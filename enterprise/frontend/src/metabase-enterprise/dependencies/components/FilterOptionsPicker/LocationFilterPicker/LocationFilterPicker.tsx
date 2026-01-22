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
  const defaultValue = true;
  const { includePersonalCollections = defaultValue } = filterOptions;

  const handleIncludeInPersonalCollectionsChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const newValue = event.target.checked;
    const isDefault = newValue === defaultValue;

    onFilterOptionsChange({
      ...filterOptions,
      includePersonalCollections: isDefault ? undefined : newValue,
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
