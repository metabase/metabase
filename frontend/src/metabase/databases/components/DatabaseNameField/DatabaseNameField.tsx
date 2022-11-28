import React from "react";
import { t } from "ttag";
import FormInput from "metabase/core/components/FormInput";
import { Engine } from "metabase-types/api";

export interface DatabaseNameFieldProps {
  engine: string;
  engines: Record<string, Engine>;
}

const DatabaseNameField = ({
  engine,
  engines,
}: DatabaseNameFieldProps): JSX.Element => {
  const name = engines[engine]?.["driver-name"] ?? t`Database`;

  return (
    <FormInput
      name="name"
      title={t`Display name`}
      placeholder={t`Our ${name}`}
      infoTooltip={t`Choose what this data will be called in Metabase.`}
    />
  );
};

export default DatabaseNameField;
