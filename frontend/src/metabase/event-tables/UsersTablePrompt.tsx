import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Text, type TextProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

/**
 * The event table's fields in Data Studio, where a foreign key to the people
 * table is set, for someone who can open Data Studio and edit the table;
 * undefined for anyone else.
 */
const useTableFieldsUrl = (table: Table): string | undefined => {
  const hasDataStudioAccess = useSelector(canAccessDataStudio);
  return table.can_write && hasDataStudioAccess
    ? Urls.dataStudioData({
        databaseId: table.db_id,
        schemaName: table.schema,
        tableId: table.id,
        tab: "field",
      })
    : undefined;
};

type UsersTablePromptProps = Pick<TextProps, "size"> & {
  table: Table;
};

/** Asks for a people table to be linked, with a way to do it for someone who can. */
export const UsersTablePrompt = ({ table, size }: UsersTablePromptProps) => {
  const fieldsUrl = useTableFieldsUrl(table);
  return fieldsUrl !== undefined ? (
    <Text c="text-secondary" size={size}>
      {t`Link a people table to filter or break out by their properties.`}{" "}
      <Link variant="brand" to={fieldsUrl}>
        {t`Set up a foreign key`}
      </Link>
    </Text>
  ) : (
    <Text c="text-secondary" size={size}>
      {t`Ask an admin to link a people table to filter or break out by their properties.`}
    </Text>
  );
};
