import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { canAccessDataStudio } from "metabase/common/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Button, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

type TableNotSetUpProps = {
  table: Table;
};

/**
 * Says the table can't be analyzed until it's set up, and links someone who
 * can set it up to its Events tab in Data Studio.
 */
export const TableNotSetUp = ({ table }: TableNotSetUpProps) => {
  const hasDataStudioAccess = useSelector(canAccessDataStudio);
  const tableSettingsUrl =
    table.can_write && hasDataStudioAccess
      ? Urls.dataStudioData({
          databaseId: table.db_id,
          schemaName: table.schema,
          tableId: table.id,
          tab: "events",
        })
      : undefined;
  return (
    <Stack align="center" justify="center" flex={1} gap="md" ta="center">
      <Title
        order={4}
      >{t`This table isn't set up for product analysis yet`}</Title>
      {tableSettingsUrl !== undefined ? (
        <Button
          variant="filled"
          component={ForwardRefLink}
          to={tableSettingsUrl}
        >
          {t`Set up in Data Studio`}
        </Button>
      ) : (
        <Text c="text-secondary">
          {t`Ask an admin to set up this table in Data Studio.`}
        </Text>
      )}
    </Stack>
  );
};
