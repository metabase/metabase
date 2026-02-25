import { replace } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import { newAdvancedTransform } from "metabase/lib/urls";
import { Button, Combobox, Group, Icon, Text, useCombobox } from "metabase/ui";
import {
  ADVANCED_TRANSFORM_TYPES,
  type AdvancedTransformType,
  isAdvancedTransformType,
} from "metabase-types/api";

const transformTypes = Object.keys(
  ADVANCED_TRANSFORM_TYPES,
) as AdvancedTransformType[];

type AdvancedTransformTypeSelectProps = {
  value: AdvancedTransformType;
};

export function TransformTypeSelect({
  value,
}: AdvancedTransformTypeSelectProps) {
  const dispatch = useDispatch();
  const combobox = useCombobox();
  const onChange = (type: string) => {
    if (isAdvancedTransformType(type)) {
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
            {ADVANCED_TRANSFORM_TYPES[value].displayName}
            <Icon name="chevrondown" size={10} />
          </Group>
        </Button>
      </Combobox.Target>
      <Combobox.Dropdown miw="8rem">
        <Combobox.Options>
          {transformTypes.map((type) => (
            <Combobox.Option value={type} key={type} py="xs">
              <Text>{ADVANCED_TRANSFORM_TYPES[type].displayName}</Text>
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
