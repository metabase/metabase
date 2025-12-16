import { useMemo } from "react";
import { t } from "ttag";

import { Checkbox, Stack } from "metabase/ui";
import type { DependencyGroupType } from "metabase-types/api";

import { getDependencyGroupTypeInfo } from "../../../../../utils";

type TypeFilterPickerProps = {
  groupTypes: DependencyGroupType[];
  availableGroupTypes: DependencyGroupType[];
  onChange: (groupTypes: DependencyGroupType[]) => void;
};

export function TypeFilterPicker({
  groupTypes,
  availableGroupTypes,
  onChange,
}: TypeFilterPickerProps) {
  const groupOptions = useMemo(
    () =>
      availableGroupTypes.map((groupType) => ({
        value: groupType,
        label: getDependencyGroupTypeInfo(groupType).label,
      })),
    [availableGroupTypes],
  );

  const handleChange = (value: string[]) => {
    const newGroupTypes = availableGroupTypes.filter((groupType) =>
      value.includes(groupType),
    );
    onChange(newGroupTypes);
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
