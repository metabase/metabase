import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import { FormField } from "metabase/forms";
import { Button } from "metabase/ui";

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
      <Button
        w="fit-content"
        variant="subtle"
        size="compact-sm"
        onClick={handleClick}
      >
        {value ? t`Use password` : t`Use an authentication provider`}
      </Button>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseAuthProviderSectionField;
