import { useMemo } from "react";
import { t } from "ttag";

import { Checkbox, Stack } from "metabase/ui";
import type {
  CardType,
  DependencyGroupType,
  DependencyType,
} from "metabase-types/api";

import {
  getCardTypes,
  getDependencyGroupOptions,
  getDependencyGroupTypes,
  getDependencyTypes,
} from "./utils";

type TypeFilterPickerProps = {
  types: DependencyType[];
  cardTypes: CardType[];
  availableGroupTypes: DependencyGroupType[];
  onChange: (types: DependencyType[], cardTypes: CardType[]) => void;
};

export function TypeFilterPicker({
  types,
  cardTypes,
  availableGroupTypes,
  onChange,
}: TypeFilterPickerProps) {
  const groupTypes = useMemo(
    () => getDependencyGroupTypes(types, cardTypes),
    [types, cardTypes],
  );
  const groupOptions = useMemo(
    () => getDependencyGroupOptions(availableGroupTypes),
    [availableGroupTypes],
  );

  const handleChange = (value: string[]) => {
    const newGroupTypes = availableGroupTypes.filter((groupType) =>
      value.includes(groupType),
    );
    const newTypes = getDependencyTypes(newGroupTypes);
    const newCardTypes = getCardTypes(newGroupTypes);
    onChange(newTypes, newCardTypes);
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
