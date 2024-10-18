import { t } from "ttag";

import FormInput from "metabase/core/components/FormInput";
import type { Engine } from "metabase-types/api";

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
      // eslint-disable-next-line no-literal-metabase-strings -- Admin settings
      rightIconTooltip={t`Choose what this data will be called in Metabase.`}
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseNameField;
