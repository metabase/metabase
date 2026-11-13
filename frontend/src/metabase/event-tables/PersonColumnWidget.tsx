import type { ComponentProps } from "react";

import { Stack } from "metabase/ui";
import type { Table } from "metabase-types/api";

import { ColumnPickerWidget } from "./ColumnPickerWidget";
import { UsersTablePrompt } from "./UsersTablePrompt";
import { getUsersTableLink } from "./users-table";

type PersonColumnWidgetProps = ComponentProps<typeof ColumnPickerWidget> & {
  table?: Table;
};

/** The person column picker, which asks for a people table while none is linked. */
export const PersonColumnWidget = ({
  table,
  ...props
}: PersonColumnWidgetProps) => {
  const isMissingUsersTable =
    table !== undefined &&
    props.value !== null &&
    getUsersTableLink(table, props.value) === undefined;
  return (
    <Stack gap="xs">
      <ColumnPickerWidget {...props} />
      {isMissingUsersTable && <UsersTablePrompt table={table} size="sm" />}
    </Stack>
  );
};
