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
    <Combobox onOptionSubmit={onChange} store={combobox} position="top">
      <Combobox.Target>
        <Button
          c="text-secondary"
          onClick={() => combobox.toggleDropdown()}
          pl="xs"
          pr={0}
          py={0}
          h="1.5rem"
          variant="subtle"
        >
          <Group fz="sm" gap="sm" align="center" fw="normal">
            {ADVANCED_TRANSFORM_TYPES[value].displayName}
            <Icon name="chevrondown" size={8} />
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
