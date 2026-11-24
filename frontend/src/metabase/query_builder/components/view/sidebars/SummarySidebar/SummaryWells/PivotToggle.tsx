import { t } from "ttag";

import { ActionIcon, Icon, Tooltip } from "metabase/ui";

type PivotToggleProps = {
  isPivotMode: boolean;
  onToggle: () => void;
};

export function PivotToggle({ isPivotMode, onToggle }: PivotToggleProps) {
  const label = isPivotMode
    ? t`Back to breakouts`
    : t`Pivot into rows and columns`;

  return (
    <Tooltip label={label}>
      <ActionIcon
        variant="subtle"
        size="sm"
        selected={isPivotMode}
        aria-label={label}
        onClick={onToggle}
      >
        <Icon name="pivot_table" />
      </ActionIcon>
    </Tooltip>
  );
}
