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

import { getSharedFieldStyleProps } from "../styles";

const ICON_SIZE = 16;

export interface DatabaseEngineSelectProps {
  options: SelectOption[];
  disabled: boolean;
  onChange: (engine: string) => void;
  engineKey: string | undefined;
}

export const DatabaseEngineSelect = ({
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
      searchable
      leftSection={<DatabaseIcon engineKey={engineKey} />}
      renderOption={renderSelectOption}
      {...getSharedFieldStyleProps()}
    />
  );
};

function DatabaseIcon({ engineKey }: { engineKey: string | undefined }) {
  const defaultIcon = <Icon name="database" size={ICON_SIZE} />;
  if (!engineKey) {
    return defaultIcon;
  }

  const logoSource = getEngineLogo(engineKey);

  return logoSource ? (
    <img src={logoSource} width={ICON_SIZE} height={ICON_SIZE} alt="" />
  ) : (
    defaultIcon
  );
}

const renderSelectOption: SelectProps["renderOption"] = ({ option }) => {
  return (
    <SelectItem>
      <Group gap="sm">
        <DatabaseIcon engineKey={option.value} /> {option.label}
      </Group>
    </SelectItem>
  );
};
