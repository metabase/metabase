import { useField, useFormikContext } from "formik";
import { useEffect, useMemo } from "react";

import { FormTextInput, type FormTextInputProps } from "metabase/forms";
import type { DatabaseData, DatabaseProvider } from "metabase-types/api";

import { ProviderIcon } from "./ProviderIcon";
import { detectDBProvider } from "./database-providers";

export function DatabaseHostnameWithProviderField(
  props: FormTextInputProps & {
    providers?: DatabaseProvider[];
  },
) {
  const [{ value }] = useField(props.name);
  const { setFieldValue } = useFormikContext<DatabaseData>();

  const provider = useMemo(() => {
    return detectDBProvider(value, props.providers);
  }, [value, props.providers]);

  useEffect(() => {
    setFieldValue("provider_name", provider ?? null);
  }, [provider, setFieldValue]);

  return (
    <FormTextInput
      {...props}
      leftSection={<ProviderIcon provider={provider} />}
    />
  );
}
