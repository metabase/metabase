import { useCallback } from "react";
import { t } from "ttag";

import { getEngineLogo } from "metabase/databases/utils/engine";
import { FormSelect } from "metabase/forms";
import {
  Group,
  Icon,
  SelectItem,
  type SelectOption,
  type SelectProps,
} from "metabase/ui";

const ICON_SIZE = 16;

export interface DatabaseEngineSelectProps {
  options: SelectOption[];
  disabled: boolean;
  onChange: (engine: string) => void;
  engineKey: string | undefined;
}

const DatabaseEngineSelect = ({
  options,
  disabled,
  onChange,
  engineKey,
}: DatabaseEngineSelectProps): JSX.Element => {
  const handleChange = useCallback(
    (value: string) => {
      onChange(value);
    },
    [onChange],
  );

  return (
    <FormSelect
      name="engine"
      label={t`Database type`}
      placeholder={t`Select a database`}
      data={options}
      disabled={disabled}
      onChange={handleChange}
      mb="md"
      searchable
      leftSection={<DatabaseIcon engineKey={engineKey} />}
      renderOption={renderSelectOption}
    />
  );
};

function DatabaseIcon({ engineKey }: { engineKey: string | undefined }) {
  if (!engineKey) {
    return null;
  }

  const logoSource = getEngineLogo(engineKey);

  return logoSource ? (
    <img src={logoSource} width={ICON_SIZE} height={ICON_SIZE} alt="" />
  ) : (
    <Icon name="database" size={ICON_SIZE} />
  );
}

//
const renderSelectOption: SelectProps["renderOption"] = ({ option }) => {
  return (
    <SelectItem>
      <Group gap="sm">
        <DatabaseIcon engineKey={option.value} /> {option.label}
      </Group>
    </SelectItem>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEngineSelect;
