import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { FormField } from "metabase/common/components/FormField";

import S from "./DatabaseSectionField.module.css";

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
      <Button
        className={S.sectionButton}
        type="button"
        iconRight={value ? "chevronup" : "chevrondown"}
        onClick={handleClick}
      >
        {value ? t`Hide advanced options` : t`Show advanced options`}
      </Button>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSectionField;
