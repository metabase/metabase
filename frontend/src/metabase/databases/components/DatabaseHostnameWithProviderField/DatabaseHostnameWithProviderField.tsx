import { useField, useFormikContext } from "formik";
import { useEffect } from "react";

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

  const provider = detectDBProvider(value, props.providers);

  useEffect(() => {
    setFieldValue("provider_name", provider ?? "");
  }, [provider, setFieldValue]);

  return (
    <FormTextInput
      {...props}
      leftSection={<ProviderIcon provider={provider} />}
    />
  );
}
