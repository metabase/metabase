import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import { FormField } from "metabase/forms";
import { Button } from "metabase/ui";

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
      <Button
        w="fit-content"
        variant="subtle"
        size="compact-sm"
        onClick={handleClick}
      >
        {value ? t`Use account name` : t`Use hostname`}
      </Button>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseHostnameSectionField;
