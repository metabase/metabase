import { useFormikContext } from "formik";
import { useMemo } from "react";

import DatabaseEngineSelect from "metabase/databases/components/DatabaseEngineField/DatabaseEngineSelect";
import { getEngineOptions } from "metabase/databases/utils/engine";
import type { DatabaseData, Engine } from "metabase-types/api";

import DatabaseEngineWidget from "./DatabaseEngineWidget";

export interface DatabaseEngineFieldProps {
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  isHosted: boolean;
  isAdvanced: boolean;
  disabled?: boolean;
  onChange: (engine: string | undefined) => void;
}

export const EmbeddingSetupDatabaseEngineField = ({
  engineKey,
  engines,
  isHosted,
  isAdvanced,
  disabled,
  onChange,
}: DatabaseEngineFieldProps): JSX.Element => {
  const { values } = useFormikContext<DatabaseData>();

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey, isAdvanced);
  }, [engines, engineKey, isAdvanced]);

  return isAdvanced ? (
    <DatabaseEngineSelect
      options={options}
      disabled={disabled || values.is_sample}
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
