import { useState } from "react";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import {
  FileInput,
  Icon,
  Input,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type { LlmProviderConfig, LlmProviderField } from "metabase-types/api";

import { isVisibleField } from "./visible-fields";

export function ProviderConfigFields({
  fields,
  values,
  onChange,
  disabled,
  disabledFields = [],
  autoFocusFirstField,
}: {
  fields: LlmProviderField[];
  values: LlmProviderConfig;
  onChange: (key: string, value: string) => void;
  disabled?: boolean;
  // fields the environment owns: shadowed by an MB_LLM_* variable, so editing them here would do nothing
  disabledFields?: string[];
  autoFocusFirstField?: boolean;
}) {
  const visibleFields = fields.filter((field) =>
    isVisibleField(field, fields, values),
  );

  if (visibleFields.length === 0) {
    return null;
  }

  return (
    <Stack gap="md">
      {visibleFields.map((field, index) => (
        <ProviderConfigField
          key={field.key}
          field={field}
          value={values[field.key] ?? ""}
          onChange={(value) => onChange(field.key, value)}
          disabled={disabled || disabledFields.includes(field.key)}
          autoFocus={autoFocusFirstField && index === 0}
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
  autoFocus,
}: {
  field: LlmProviderField;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
}) {
  const focusProps = autoFocus ? { autoFocus, "data-autofocus": true } : {};
  const externalDocsUrl = field.docs_url;
  const description = externalDocsUrl ? (
    <ExternalLink href={externalDocsUrl}>
      {t`Where do I find this?`}
    </ExternalLink>
  ) : (
    field.help && <Text size="sm">{field.help}</Text>
  );

  if (field.type === "segmented") {
    return (
      <Input.Wrapper label={field.label} description={description}>
        <SegmentedControl
          mt="xs"
          data={field.options ?? []}
          value={value || field.default || ""}
          onChange={onChange}
          disabled={disabled}
          aria-label={field.label}
          fullWidth
        />
      </Input.Wrapper>
    );
  }

  if (field.type === "file") {
    return (
      <ProviderConfigFileField
        field={field}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    );
  }

  if (field.type === "select") {
    return (
      <Select
        label={field.label}
        description={description}
        data={withCurrentValue(field.options ?? [], value)}
        value={value || field.default || null}
        onChange={(next) => onChange(next ?? "")}
        disabled={disabled}
        searchable
        {...focusProps}
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
      {...focusProps}
    />
  );
}

// A connection saved with a model the registry no longer offers still has to show what it runs on.
function withCurrentValue(
  options: { value: string; label: string }[],
  value: string,
) {
  return value && !options.some((option) => option.value === value)
    ? [...options, { value, label: value }]
    : options;
}

function ProviderConfigFileField({
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
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | undefined>();
  // The stored file is a secret the API only ever echoes back masked, so the picker starts empty
  // and an empty picker means the saved one is kept.
  const hasSavedValue = value !== "" && file == null;

  const handleChange = (nextFile: File | null) => {
    setFile(nextFile);
    setError(undefined);
    if (!nextFile) {
      onChange("");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.onerror = () => setError(t`Could not read the file.`);
    reader.readAsText(nextFile);
  };

  return (
    <FileInput
      label={field.label}
      description={
        hasSavedValue
          ? t`A file is saved. Choose a new one to replace it.`
          : field.help
      }
      placeholder={field.placeholder ?? undefined}
      leftSection={<Icon name="upload" />}
      accept="application/json"
      value={file}
      onChange={handleChange}
      error={error}
      disabled={disabled}
      required={field.required}
      clearable
      clearButtonProps={{ "aria-label": t`Clear the selected file` }}
      // the visible control is a button; the input it drives needs a name of its own
      fileInputProps={{ "aria-label": t`${field.label} file input` }}
    />
  );
}
