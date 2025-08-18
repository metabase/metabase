import { useCallback } from "react";
import { t } from "ttag";

import { FormSelect } from "metabase/forms";
import type { SelectOption } from "metabase/ui";

export interface DatabaseEngineSelectProps {
  options: SelectOption[];
  disabled: boolean;
  onChange: (engine: string) => void;
}

const DatabaseEngineSelect = ({
  options,
  disabled,
  onChange,
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
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEngineSelect;
