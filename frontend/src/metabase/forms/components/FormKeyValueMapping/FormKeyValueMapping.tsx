import { useField } from "formik";
import { t } from "ttag";

import { MappingEditor } from "metabase/core/components/MappingEditor";
import { Box, Text, type BoxProps } from "metabase/ui";

type Props = BoxProps & {
  name: string;
  label?: string;
};

export const FormKeyValueMapping = ({
  name = "login_attributes",
  label = t`Attributes`,
  ...props
}: Props) => {
  const [{ value }, , { setValue, setError }] = useField(name);

  const handleError = (error: boolean) => {
    if (error) {
      setError(t`Duplicate login attribute keys`);
    }
  };

  return (
    <Box {...props}>
      {label && (
        <Text component="label" fw="bold">
          {label}
        </Text>
      )}

      <MappingEditor
        value={value || {}}
        onChange={setValue}
        onError={handleError}
        addText={t`Add an attribute`}
      />
    </Box>
  );
};
