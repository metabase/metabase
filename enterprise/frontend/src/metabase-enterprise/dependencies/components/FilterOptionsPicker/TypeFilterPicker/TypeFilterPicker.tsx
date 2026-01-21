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
  const [isEmpty, setIsEmpty] = useState(false);

  const selectedGroupTypes = getDependencyGroupTypes(
    filters.types == null || filters.types.length === 0
      ? availableTypes
      : filters.types,
    filters.cardTypes == null || filters.cardTypes.length === 0
      ? availableCardTypes
      : filters.cardTypes,
  );

  const availableGroupTypes = getDependencyGroupTypes(
    availableTypes,
    availableCardTypes,
  );

  const groupOptions = availableGroupTypes.map((groupType) => ({
    value: groupType,
    label: getDependencyGroupTypeInfo(groupType).label,
  }));

  const handleChange = (newValue: string[]) => {
    const newGroupTypes = availableGroupTypes.filter((groupType) =>
      newValue.includes(groupType),
    );
    setIsEmpty(newGroupTypes.length === 0);
    onFiltersChange({
      ...filters,
      types: getDependencyTypes(newGroupTypes),
      cardTypes: getCardTypes(newGroupTypes),
    });
  };

  return (
    <Checkbox.Group
      label={t`Entity type`}
      value={isEmpty ? [] : selectedGroupTypes}
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
