import { msgid, ngettext, t } from "ttag";

import { Box } from "metabase/ui";
import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { useGetDataAppGroupPermissionWarningsQuery } from "metabase-enterprise/api";
import type { DataApp, DataAppGroup } from "metabase-types/api";

type DataAppGroupDataAccessProps = {
  app: DataApp;
  group: DataAppGroup;
};

export function DataAppGroupDataAccess({
  app,
  group,
}: DataAppGroupDataAccessProps) {
  const { data: warnings } = useGetDataAppGroupPermissionWarningsQuery(
    app.name,
  );

  if (warnings == null) {
    return EMPTY_CELL_PLACEHOLDER;
  }

  const warning = warnings.find(({ group_id }) => group_id === group.id);
  if (warning == null) {
    return t`All tables`;
  }

  const tableCount = warning.missing_tables.length;
  return (
    <Box c="feedback-negative">
      {ngettext(
        msgid`Missing ${tableCount} table`,
        `Missing ${tableCount} tables`,
        tableCount,
      )}
    </Box>
  );
}
