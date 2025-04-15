import { t } from "ttag";

import { Checkbox, Stack } from "metabase/ui";
import type { DashboardCard } from "metabase-types/api";

const DEFAULT_EDITABLE_TABLE_ACTIONS = [
  {
    label: t`Create a new record`,
    value: "edit",
  },
  {
    label: t`Delete a record`,
    value: "delete",
  },
];

export const ConfigureEditableTableActions = ({
  dashcard,
}: {
  dashcard: DashboardCard;
}) => {
  const enabledActions =
    dashcard.visualization_settings?.["editableTable.enabledActions"] ?? [];

  return (
    <Stack>
      {DEFAULT_EDITABLE_TABLE_ACTIONS.map(({ label, value }) => (
        <Checkbox
          key={value}
          label={label}
          name={value}
          checked={enabledActions.includes(value)}
        />
      ))}
    </Stack>
  );
};
