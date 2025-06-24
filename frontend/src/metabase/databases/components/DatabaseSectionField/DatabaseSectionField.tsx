import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import FormField from "metabase/core/components/FormField";

import { SectionButton } from "./DatabaseSectionField.styled";

export interface DatabaseSectionFieldProps {
  name: string;
}

const DatabaseSectionField = ({
  name,
}: DatabaseSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const handleClick = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <SectionButton
        type="button"
        iconRight={value ? "chevronup" : "chevrondown"}
        onClick={handleClick}
      >
        {value ? t`Hide advanced options` : t`Show advanced options`}
      </SectionButton>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSectionField;
