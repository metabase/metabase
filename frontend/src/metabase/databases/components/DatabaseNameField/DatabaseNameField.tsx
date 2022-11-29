import React from "react";
import { t } from "ttag";
import FormInput from "metabase/core/components/FormInput";
import { Engine } from "metabase-types/api";

export interface DatabaseNameFieldProps {
  engine: Engine;
}

const DatabaseNameField = ({ engine }: DatabaseNameFieldProps): JSX.Element => {
  const name = engine["driver-name"] ?? t`Database`;

  return (
    <FormInput
      name="name"
      title={t`Display name`}
      placeholder={t`Our ${name}`}
      rightIcon="info"
      rightIconTooltip={t`Choose what this data will be called in Metabase.`}
      nullable
    />
  );
};

export default DatabaseNameField;
