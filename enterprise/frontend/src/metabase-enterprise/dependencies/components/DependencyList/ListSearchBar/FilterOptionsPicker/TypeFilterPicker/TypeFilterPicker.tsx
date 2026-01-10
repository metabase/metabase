import { useState } from "react";
import { t } from "ttag";

import type * as Urls from "metabase/lib/urls";
import { Checkbox, Stack } from "metabase/ui";

import { getDependencyGroupTypeInfo } from "../../../../../utils";
import type { DependencyListMode } from "../../../types";
import { getAvailableGroupTypes } from "../../../utils";

type TypeFilterPickerProps = {
  mode: DependencyListMode;
  params: Urls.DependencyListParams;
  onParamsChange: (params: Urls.DependencyListParams) => void;
};

export function TypeFilterPicker({
  mode,
  params,
  onParamsChange,
}: TypeFilterPickerProps) {
  const availableGroupTypes = getAvailableGroupTypes(mode);

  // preserve selected options in state to allow to deselect all types
  // until the popover is closed
  const [groupTypes, setGroupTypes] = useState(
    params.groupTypes ?? availableGroupTypes,
  );

  const groupOptions = availableGroupTypes.map((groupType) => ({
    value: groupType,
    label: getDependencyGroupTypeInfo(groupType).label,
  }));

  const handleChange = (newValue: string[]) => {
    const newGroupTypes = availableGroupTypes.filter((groupType) =>
      newValue.includes(groupType),
    );
    setGroupTypes(newGroupTypes);
    onParamsChange({
      ...params,
      groupTypes:
        newGroupTypes.length === availableGroupTypes.length
          ? undefined
          : newGroupTypes,
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
