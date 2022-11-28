import React, { useMemo } from "react";
import { t } from "ttag";
import FormSelect from "metabase/core/components/FormSelect";
import { Engine } from "metabase-types/api";

export interface DatabaseEngineFieldProps {
  engines: Record<string, Engine>;
}

const DatabaseEngineField = ({
  engines,
}: DatabaseEngineFieldProps): JSX.Element => {
  const options = useMemo(() => getEngineOptions(engines), [engines]);

  return (
    <FormSelect
      name="engine"
      title={t`Database type`}
      placeholder={t`Select a database`}
      options={options}
    />
  );
};

const getEngineOptions = (engines: Record<string, Engine>) => {
  return Object.entries(engines)
    .map(([value, engine]) => ({ name: engine["driver-name"], value }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export default DatabaseEngineField;
