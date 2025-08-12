import { useField } from "formik";

import FormInput from "metabase/common/components/FormInput";

import { ProviderIcon } from "./ProviderIcon";
import { detectDBProvider } from "./database-providers";

export function DatabaseHostnameWithProviderField(props: {
  name: string;
  nullable: boolean;
}) {
  const [{ value }] = useField(props.name);

  const provider = detectDBProvider(value);

  return (
    <FormInput {...props} leftSection={<ProviderIcon provider={provider} />} />
  );
}
