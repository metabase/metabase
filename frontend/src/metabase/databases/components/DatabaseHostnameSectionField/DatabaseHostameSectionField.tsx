import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";

import { SectionButton } from "./DatabaseHostameSectionField.styled";

export interface DatabaseHostnameSectionFieldProps {
  name: string;
}

const DatabaseHostnameSectionField = ({
  name,
}: DatabaseHostnameSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <SectionButton type="button" onClick={handleClick}>
        {value ? t`Use account name` : t`Use hostname`}
      </SectionButton>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseHostnameSectionField;
