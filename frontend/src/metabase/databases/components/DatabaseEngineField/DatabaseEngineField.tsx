import { useFormikContext } from "formik";
import { useMemo } from "react";

import type { DatabaseData, Engine } from "metabase-types/api";

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
  const { values } = useFormikContext<DatabaseData>();

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey, isAdvanced);
  }, [engines, engineKey, isAdvanced]);

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseEngineField;
