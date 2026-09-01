import { t } from "ttag";

import {
  Badge,
  Ellipsified,
  Group,
  type TreeTableColumnDef,
} from "metabase/ui";
import { getFullName } from "metabase/utils/user";
import type { MfaAdminUser } from "metabase-types/api";

export function getNameColumn<
  TUser extends MfaAdminUser,
>(): TreeTableColumnDef<TUser> {
  return {
    id: "name",
    header: t`Name`,
    minWidth: 160,
    maxAutoWidth: 320,
    accessorFn: (user) => getFullName(user) ?? user.email,
    cell: ({ row }) => {
      const user = row.original;
      return (
        <Group gap="sm" wrap="nowrap" miw={0}>
          <Ellipsified>{getFullName(user) ?? "-"}</Ellipsified>
          {!user.is_active && (
            <Badge variant="light" color="brand">{t`Inactive`}</Badge>
          )}
        </Group>
      );
    },
  };
}

export function getEmailColumn<
  TUser extends MfaAdminUser,
>(): TreeTableColumnDef<TUser> {
  return {
    id: "email",
    header: t`Email`,
    minWidth: 160,
    accessorFn: (user) => user.email,
    cell: ({ getValue }) => <Ellipsified>{String(getValue())}</Ellipsified>,
  };
}
