import React, { useMemo, useRef } from "react";
import { Engine } from "metabase-types/api";
import { getEngineOptions } from "../../utils/engine";
import DatabaseEngineSelect from "./DatabaseEngineSelect";
import DatabaseEngineWidget from "./DatabaseEngineWidget";

export interface DatabaseEngineFieldProps {
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  isHosted: boolean;
  isAdvanced: boolean;
  onChange: (engine: string | undefined) => void;
}

const DatabaseEngineField = ({
  engineKey,
  engines,
  isHosted,
  isAdvanced,
  onChange,
}: DatabaseEngineFieldProps): JSX.Element => {
  const { current: isNew } = useRef(engineKey == null);

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey);
  }, [engines, engineKey]);

  return isAdvanced ? (
    <DatabaseEngineSelect
      options={options}
      disabled={!isNew}
      onChange={onChange}
    />
  ) : (
    <DatabaseEngineWidget
      engineKey={engineKey}
      options={options}
      isHosted={isHosted}
      onChange={onChange}
    />
  );
};

export default DatabaseEngineField;
