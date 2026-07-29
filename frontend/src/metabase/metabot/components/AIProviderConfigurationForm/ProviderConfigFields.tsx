import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Select, Stack, Text, TextInput } from "metabase/ui";
import type { LlmProviderConfig, LlmProviderField } from "metabase-types/api";

export function ProviderConfigFields({
  fields,
  values,
  onChange,
  disabled,
}: {
  fields: LlmProviderField[];
  values: LlmProviderConfig;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Stack gap="md">
      {fields.map((field) => (
        <ProviderConfigField
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          onChange={(value) => onChange(field.key, value)}
          disabled={disabled}
        />
      ))}
    </Stack>
  );
}

function ProviderConfigField({
  field,
  value,
  onChange,
  disabled,
}: {
  field: LlmProviderField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const docsUrl = field.docs_url;
  const description = docsUrl ? (
    <ExternalLink href={docsUrl}>{t`Where do I find this?`}</ExternalLink>
  ) : (
    field.help && <Text size="sm">{field.help}</Text>
  );

  if (field.type === "select") {
    return (
      <Select
        label={field.label}
        description={description}
        data={field.options ?? []}
        value={value || field.default || null}
        onChange={(next) => onChange(next ?? "")}
        disabled={disabled}
        searchable
      />
    );
  }

  return (
    <TextInput
      label={field.label}
      description={description}
      type={field.type === "password" ? "password" : "text"}
      placeholder={field.placeholder ?? field.default ?? undefined}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      disabled={disabled}
      required={field.required}
    />
  );
}
