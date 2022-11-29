import React, { useMemo, useRef } from "react";
import { Engine } from "metabase-types/api";
import DatabaseEngineSelect from "./DatabaseEngineSelect";

export interface DatabaseEngineFieldProps {
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  onChange: (engine: string) => void;
}

const DatabaseEngineField = ({
  engineKey,
  engines,
  onChange,
}: DatabaseEngineFieldProps): JSX.Element => {
  const { current: isNew } = useRef(engineKey == null);

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey);
  }, [engines, engineKey]);

  return (
    <DatabaseEngineSelect
      options={options}
      disabled={!isNew}
      onChange={onChange}
    />
  );
};

const getEngineOptions = (
  engines: Record<string, Engine>,
  engineKey?: string,
) => {
  return Object.entries(engines)
    .filter(([key, engine]) => key === engineKey || !engine["superseded-by"])
    .map(([key, engine]) => ({ name: engine["driver-name"], value: key }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export default DatabaseEngineField;
