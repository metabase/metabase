import { useField } from "formik";
import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { FormField } from "metabase/forms";
import { Box, Radio } from "metabase/ui";

export interface DatabaseConnectionSectionFieldProps {
  name: string;
}

export const DatabaseConnectionSectionField = ({
  name,
}: DatabaseConnectionSectionFieldProps): JSX.Element => {
  const [{ value }, , { setValue }] = useField(name);

  const radioValue = value ? "use-conn-uri" : "form-fields";

  const toggleValue = useCallback(() => {
    setValue(!value);
  }, [value, setValue]);

  return (
    <FormField>
      <Box
        bg="background_page-tertiary"
        p="xl"
        style={{ borderRadius: "var(--default-border-radius)" }}
      >
        <Radio.Group
          value={radioValue}
          onChange={toggleValue}
          name="connectionMethod"
          label={t`Connection method`}
        >
          <Radio
            value="form-fields"
            label={t`Fill out host, port and database name`}
            my="xxs"
          />
          <Radio value="use-conn-uri" label={t`Use a connection string`} />
        </Radio.Group>
      </Box>
    </FormField>
  );
};
