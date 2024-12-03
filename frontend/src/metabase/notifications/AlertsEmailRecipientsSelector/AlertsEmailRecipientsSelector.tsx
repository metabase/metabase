import type { JSX } from "react";
import { t } from "ttag";

import { isEmail } from "metabase/lib/email";
import { MultiSelect } from "metabase/ui";

const MAX_EMAILS_LIMIT = 50;

export type AlertsEmailSelectorProps = {
  value: string[];
  onChange: (newValue: string[]) => void;
};

export const AlertsEmailRecipientsSelector = ({
  value,
  onChange,
}: AlertsEmailSelectorProps): JSX.Element => {
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
      shouldCreate={isEmail}
      onChange={onChange}
      getCreateLabel={query => t`Add "${query}"`}
      onCreate={query => {
        onChange([...value, query]);
        return query;
      }}
    />
  );
};
