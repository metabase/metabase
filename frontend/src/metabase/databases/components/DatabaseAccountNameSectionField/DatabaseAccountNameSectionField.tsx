import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";

import { SectionButton } from "./DatabaseAccountNameSectionField.styled";

export interface DatabaseAccountNameSectionFieldProps {
  name: string;
}

const DatabaseAccountNameSectionField = ({
  name,
}: DatabaseAccountNameSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <SectionButton type="button" onClick={handleClick}>
        {value ? t`Use hostname` : t`Use  account name`}
      </SectionButton>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseAccountNameSectionField;
