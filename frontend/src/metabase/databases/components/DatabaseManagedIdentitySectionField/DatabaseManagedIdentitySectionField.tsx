import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";

import { SectionButton } from "./DatabaseManagedIdentitySectionField.styled";

export interface DatabaseManagedIdentitySectionFieldProps {
  name: string;
}

const DatabaseManagedIdentitySectionField = ({
  name,
}: DatabaseManagedIdentitySectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <SectionButton type="button" onClick={handleClick}>
        {value ? t`Use managed identity` : t`Use password`}
      </SectionButton>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseManagedIdentitySectionField;
