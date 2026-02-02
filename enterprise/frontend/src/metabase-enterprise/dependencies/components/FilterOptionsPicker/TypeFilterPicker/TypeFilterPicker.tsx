import { useState } from "react";
import { t } from "ttag";

import { Checkbox, Stack } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import type { DependencyFilterOptions } from "../../../types";
import { getDependencyGroupTypeInfo } from "../../../utils";

type TypeFilterPickerProps = {
  filterOptions: DependencyFilterOptions;
  availableGroupTypes: DependencyGroupType[];
  onFilterOptionsChange: (filterOptions: DependencyFilterOptions) => void;
};

export function TypeFilterPicker({
  filterOptions,
  availableGroupTypes,
  onFilterOptionsChange,
}: TypeFilterPickerProps) {
  const [selectedGroupTypes, setSelectedGroupTypes] = useState(
    filterOptions.groupTypes ?? availableGroupTypes,
  );

  const groupOptions = availableGroupTypes.map((groupType) => ({
    value: groupType,
    label: getDependencyGroupTypeInfo(groupType).label,
  }));

  const handleChange = (newValue: string[]) => {
    const newGroupTypes = availableGroupTypes.filter((groupType) =>
      newValue.includes(groupType),
    );
    const isFullSelection = newGroupTypes.length === availableGroupTypes.length;

    setSelectedGroupTypes(newGroupTypes);
    onFilterOptionsChange({
      ...filterOptions,
      groupTypes: isFullSelection ? availableGroupTypes : newGroupTypes,
    });
  };

  return (
    <Checkbox.Group
      label={t`Entity type`}
      value={selectedGroupTypes}
      onChange={handleChange}
    >
      <Stack gap="sm" mt="sm">
        {groupOptions.map((groupOption) => (
          <Checkbox
            key={groupOption.value}
            value={groupOption.value}
            label={groupOption.label}
          />
        ))}
      </Stack>
    </Checkbox.Group>
  );
}
