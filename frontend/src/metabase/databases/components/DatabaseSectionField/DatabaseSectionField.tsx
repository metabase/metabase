import { useField } from "formik";
import { useCallback } from "react";
import { t } from "ttag";

import { Box, Button, Icon } from "metabase/ui";

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
    <Box mb="xl">
      <Button
        w="fit-content"
        type="button"
        variant="transparent"
        size="compact-md"
        rightSection={<Icon name={value ? "chevronup" : "chevrondown"} />}
        onClick={handleClick}
      >
        {value ? t`Hide advanced options` : t`Show advanced options`}
      </Button>
    </Box>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DatabaseSectionField;
