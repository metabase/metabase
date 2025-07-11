import { useFormikContext } from "formik";
import { useMemo } from "react";

import type { DatabaseData, Engine } from "metabase-types/api";

import { getEngineOptions } from "../../utils/engine";
import { DatabaseEngineList } from "../DatabaseEngineList";

import DatabaseEngineSelect from "./DatabaseEngineSelect";

interface DatabaseEngineFieldProps {
  engineKey: string | undefined;
  engines: Record<string, Engine>;
  isAdvanced: boolean;
  disabled?: boolean;
  onChange: (engine: string | undefined) => void;
}

export const DatabaseEngineField = ({
  engineKey,
  engines,
  isAdvanced,
  disabled,
  onChange,
}: DatabaseEngineFieldProps): JSX.Element => {
  const { values } = useFormikContext<DatabaseData>();

  const options = useMemo(() => {
    return getEngineOptions(engines, engineKey, isAdvanced);
  }, [engines, engineKey, isAdvanced]);

  if (isAdvanced) {
    return (
      <DatabaseEngineSelect
        options={options}
        disabled={disabled || values.is_sample}
        onChange={onChange}
      />
    );
  }

  return (
    <DatabaseEngineList
      onSelect={onChange}
      isSetupStep={true}
      engineKey={engineKey}
    />
  );
};
