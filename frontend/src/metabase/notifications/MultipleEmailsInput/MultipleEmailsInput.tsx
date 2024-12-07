import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { isEmail } from "metabase/lib/email";
import { MultiSelect } from "metabase/ui";

const MAX_EMAILS_LIMIT = 50;

export type MultipleEmailsInputProps = {
  value: string[];
  onChange: (newValue: string[]) => void;
};

export const MultipleEmailsInput = ({
  value,
  onChange,
}: MultipleEmailsInputProps): JSX.Element => {
  const handleShouldCreate = useCallback(
    (query: string) => {
      return isEmail(query) && value.length < MAX_EMAILS_LIMIT;
    },
    [value],
  );

  // TODO: Replace this implementation to https://mantine.dev/core/tags-input/ or https://mantine.dev/core/pills-input/ after https://github.com/metabase/metabase/issues/45941
  return (
    <MultiSelect
      data={value}
      data-testid="email-selector"
      searchable
      placeholder={t`Enter one or multiple emails`}
      styles={{
        value: {
          backgroundColor: "var(--mb-color-bg-medium)",
          color: "var(--mb-color-text-primary)",
        },
        defaultValueRemove: {
          color: "var(--mb-color-text-primary)",
        },
        rightSection: {
          display: "none",
        },
      }}
      value={value}
      creatable
      limit={MAX_EMAILS_LIMIT}
      shouldCreate={handleShouldCreate}
      onChange={onChange}
      getCreateLabel={handleGetCreateLabel}
      onCreate={handleOnCreate}
    />
  );
};

function handleGetCreateLabel(query: string) {
  return t`Add "${query}"`;
}

function handleOnCreate(query: string) {
  return query;
}
