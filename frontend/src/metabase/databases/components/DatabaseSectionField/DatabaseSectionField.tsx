import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import { FormField } from "metabase/common/components/FormField";
import { Button, Icon } from "metabase/ui";

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
        w="fit-content"
        type="button"
        variant="subtle"
        size="compact-sm"
        rightSection={<Icon name={value ? "chevronup" : "chevrondown"} />}
        onClick={handleClick}
      >
        {value ? t`Hide advanced options` : t`Show advanced options`}
      </Button>
    </FormField>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSectionField;
