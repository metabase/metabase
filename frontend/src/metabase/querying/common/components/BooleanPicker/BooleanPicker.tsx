import { useState } from "react";
import { t } from "ttag";

import type { BooleanFilterValue } from "metabase/querying/common/types";
import { Button, Icon, Radio, Stack } from "metabase/ui";

type BooleanPickerProps = {
  value: BooleanFilterValue;
  withEmptyOptions?: boolean;
  onChange: (value: BooleanFilterValue) => void;
};

type BooleanFilterOption = {
  value: BooleanFilterValue;
  label: string;
  isEmpty?: boolean;
};

export function BooleanPicker({
  value,
  withEmptyOptions,
  onChange,
}: BooleanPickerProps) {
  const options = getAvailableOptions();
  const [isExpanded, setIsExpanded] = useState(
    options.some((option) => option.value === value && option.isEmpty),
  );
  const visibleOptions = options.filter(
    (option) => !option.isEmpty || isExpanded,
  );
  const hasExpandButton = withEmptyOptions && !isExpanded;

  const handleChange = (value: string) => {
    onChange(value as BooleanFilterValue);
  };

  return (
    <div>
      <Radio.Group value={value} onChange={handleChange}>
        <Stack p="md" pb={hasExpandButton ? 0 : "md"} gap="sm">
          {visibleOptions.map((option) => (
            <Radio
              key={option.value}
              value={option.value}
              label={option.label}
              size="xs"
            />
          ))}
        </Stack>
      </Radio.Group>
      {hasExpandButton && (
        <Button
          c="text-secondary"
          variant="subtle"
          aria-label={t`More options`}
          rightSection={<Icon name="chevrondown" />}
          onClick={() => setIsExpanded(true)}
        >
          {t`More options`}
        </Button>
      )}
    </div>
  );
}

function getAvailableOptions(): BooleanFilterOption[] {
  return [
    { value: "true", label: t`True` },
    { value: "false", label: t`False` },
    { value: "is-null", label: t`Empty`, isEmpty: true },
    { value: "not-null", label: t`Not empty`, isEmpty: true },
  ];
}
