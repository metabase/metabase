import { useCallback } from "react";
import { t } from "ttag";

import FormSelect from "metabase/core/components/FormSelect";
import type { SelectChangeEvent } from "metabase/core/components/Select";

import type { EngineOption } from "../../types";

export interface DatabaseEngineSelectProps {
  options: EngineOption[];
  disabled: boolean;
  onChange: (engine: string) => void;
}

const DatabaseEngineSelect = ({
  options,
  disabled,
  onChange,
}: DatabaseEngineSelectProps): JSX.Element => {
  const handleChange = useCallback(
    (event: SelectChangeEvent<string>) => {
      onChange(event.target.value);
    },
    [onChange],
  );

  return (
    <FormSelect
      name="engine"
      title={t`Database type`}
      placeholder={t`Select a database`}
      options={options}
      disabled={disabled}
      onChange={handleChange}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEngineSelect;
