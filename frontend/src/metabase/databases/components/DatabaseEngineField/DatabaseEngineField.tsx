import React, { useMemo } from "react";
import { useFormikContext } from "formik";
import { Engine } from "metabase-types/api";
import { DatabaseValues } from "../../types";
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
  const { values } = useFormikContext<DatabaseValues>();

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey);
  }, [engines, engineKey]);

  return isAdvanced ? (
    <DatabaseEngineSelect
      options={options}
      disabled={values.is_sample}
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
