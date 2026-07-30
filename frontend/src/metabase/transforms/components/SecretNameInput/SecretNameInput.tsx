import { t } from "ttag";

import { TextInput, type TextInputProps } from "metabase/ui";

import { MAX_SECRET_NAME_LENGTH, isValidSecretName } from "../../utils";

type SecretNameInputProps = Omit<TextInputProps, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

export function SecretNameInput({
  value,
  onChange,
  ...props
}: SecretNameInputProps) {
  const trimmedName = value.trim();
  const error =
    trimmedName.length > 0 && !isValidSecretName(trimmedName)
      ? t`Use uppercase letters, digits, and underscores, starting with a letter (max ${MAX_SECRET_NAME_LENGTH} characters).`
      : undefined;

  return (
    <TextInput
      label={t`Name`}
      placeholder="MY_API_TOKEN"
      {...props}
      value={value}
      error={error}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  );
}
