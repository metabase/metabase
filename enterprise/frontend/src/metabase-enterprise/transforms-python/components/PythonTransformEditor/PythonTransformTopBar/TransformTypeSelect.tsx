import { useState } from "react";
import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { newAdvancedTransform } from "metabase/lib/urls";
import { Button, Combobox, Group, Icon, Text, useCombobox } from "metabase/ui";
import {
  type AdvancedTransformType,
  isAdvancedTransformType,
} from "metabase-types/api";

import { getTypeLabel } from "./utils";

type AdvancedTransformTypeSelectProps = {
  defaultValue: AdvancedTransformType;
};

export function TransformTypeSelect({
  defaultValue,
}: AdvancedTransformTypeSelectProps) {
  const dispatch = useDispatch();
  const combobox = useCombobox();
  const [value, setValue] = useState<AdvancedTransformType>(defaultValue);
  const transformTypes: AdvancedTransformType[] = ["python", "javascript"];
  const onChange = (type: string) => {
    if (isAdvancedTransformType(type)) {
      setValue(type);
      dispatch(replace(newAdvancedTransform(type)));
    }
  };

  return (
    <Combobox onOptionSubmit={onChange} store={combobox}>
      <Combobox.Target>
        <Button
          onClick={() => combobox.toggleDropdown()}
          variant="subtle"
          size="xs"
          c="text-primary"
        >
          <Group gap="sm" align="center">
            {getTypeLabel(value)}
            <Icon name="chevrondown" size={10} />
          </Group>
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown miw="8rem">
        <Combobox.Options>
          {transformTypes.map((type) => (
            <Combobox.Option value={type} key={type} py="xs">
              <Text>{getTypeLabel(type)}</Text>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
