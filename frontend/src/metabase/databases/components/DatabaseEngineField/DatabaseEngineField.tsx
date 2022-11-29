import React, { useMemo, useRef } from "react";
import { Engine } from "metabase-types/api";
import { getEngineOptions } from "../../utils/engine";
import DatabaseEngineSelect from "./DatabaseEngineSelect";
import DatabaseEngineWidget from "./DatabaseEngineWidget";

export interface DatabaseEngineFieldProps {
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  isSetup: boolean;
  isHosted: boolean;
  onChange: (engine: string | undefined) => void;
}

const DatabaseEngineField = ({
  engineKey,
  engines,
  isSetup,
  isHosted,
  onChange,
}: DatabaseEngineFieldProps): JSX.Element => {
  const { current: isNew } = useRef(engineKey == null);

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey);
  }, [engines, engineKey]);

  return isSetup ? (
    <DatabaseEngineWidget
      engineKey={engineKey}
      options={options}
      isHosted={isHosted}
      onChange={onChange}
    />
  ) : (
    <DatabaseEngineSelect
      options={options}
      disabled={!isNew}
      onChange={onChange}
    />
  );
};

export default DatabaseEngineField;
