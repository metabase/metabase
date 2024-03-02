import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";

import { SectionButton } from "./DatabaseConnectionSectionField.styled";

export interface DatabaseConnectionSectionFieldProps {
  name: string;
}

const DatabaseConnectionSectionField = ({
  name,
}: DatabaseConnectionSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <SectionButton type="button" onClick={handleClick}>
        {value ? t`Fill out individual fields` : t`Paste a connection string`}
      </SectionButton>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseConnectionSectionField;
