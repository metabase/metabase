import React, { useCallback, useMemo, useRef } from "react";
import { t } from "ttag";
import FormSelect from "metabase/core/components/FormSelect";
import { Engine } from "metabase-types/api";
import { SelectChangeEvent } from "metabase/core/components/Select";

export interface DatabaseEngineFieldProps {
  engine?: string;
  engines: Record<string, Engine>;
  onChange: (engine: string) => void;
}

const DatabaseEngineField = ({
  engine,
  engines,
  onChange,
}: DatabaseEngineFieldProps): JSX.Element => {
  const { current: isDisabled } = useRef(engine != null);
  const options = useMemo(() => getEngineOptions(engines), [engines]);

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
      disabled={isDisabled}
      onChange={handleChange}
    />
  );
};

const getEngineOptions = (engines: Record<string, Engine>) => {
  return Object.entries(engines)
    .map(([value, engine]) => ({ name: engine["driver-name"], value }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export default DatabaseEngineField;
