import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";

import { SectionButton } from "./DatabaseAuthProviderSectionField.styled";

export interface DatabaseAuthProviderSectionFieldProps {
  name: string;
}

const DatabaseAuthProviderSectionField = ({
  name,
}: DatabaseAuthProviderSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <SectionButton type="button" onClick={handleClick}>
        {value ? t`Use password` : t`Use an authentication provider`}
      </SectionButton>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseAuthProviderSectionField;
