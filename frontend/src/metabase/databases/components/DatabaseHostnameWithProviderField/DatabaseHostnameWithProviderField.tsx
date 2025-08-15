import { useField, useFormikContext } from "formik";
import { useEffect } from "react";

import FormInput from "metabase/common/components/FormInput";
import type { DatabaseData } from "metabase-types/api";

import { ProviderIcon } from "./ProviderIcon";
import { detectDBProvider } from "./database-providers";

export function DatabaseHostnameWithProviderField(props: {
  name: string;
  nullable: boolean;
}) {
  const [{ value }] = useField(props.name);
  const { setFieldValue } = useFormikContext<DatabaseData>();

  const provider = detectDBProvider(value);

  useEffect(() => {
    setFieldValue("provider_name", provider);
  }, [provider, setFieldValue]);

  return (
    <FormInput {...props} leftSection={<ProviderIcon provider={provider} />} />
  );
}
