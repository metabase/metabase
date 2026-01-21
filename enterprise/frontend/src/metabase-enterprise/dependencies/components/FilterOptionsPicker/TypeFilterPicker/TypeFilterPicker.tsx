import { useState } from "react";
import { t } from "ttag";

import { Checkbox, Stack } from "metabase/ui";
import type {
  CardType,
  DependencyFilterOptions,
  DependencyType,
} from "metabase-types/api";

import {
  getCardTypes,
  getDependencyGroupTypeInfo,
  getDependencyGroupTypes,
  getDependencyTypes,
} from "../../../utils";

type TypeFilterPickerProps = {
  filters: DependencyFilterOptions;
  availableTypes: DependencyType[];
  availableCardTypes: CardType[];
  onFiltersChange: (filters: DependencyFilterOptions) => void;
};

export function TypeFilterPicker({
  filters,
  availableTypes,
  availableCardTypes,
  onFiltersChange,
}: TypeFilterPickerProps) {
  const availableGroupTypes = getDependencyGroupTypes(
    availableTypes,
    availableCardTypes,
  );

  // preserve selected options in state to allow to deselect all types
  // until the popover is closed
  const [groupTypes, setGroupTypes] = useState(availableGroupTypes);

  const groupOptions = availableGroupTypes.map((groupType) => ({
    value: groupType,
    label: getDependencyGroupTypeInfo(groupType).label,
  }));

  const handleChange = (newValue: string[]) => {
    const newGroupTypes = availableGroupTypes.filter((groupType) =>
      newValue.includes(groupType),
    );

    setGroupTypes(newGroupTypes);
    onFiltersChange({
      ...filters,
      types: getDependencyTypes(newGroupTypes),
      cardTypes: getCardTypes(newGroupTypes),
    });
  };

  return (
    <Checkbox.Group
      label={t`Entity type`}
      value={groupTypes}
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
