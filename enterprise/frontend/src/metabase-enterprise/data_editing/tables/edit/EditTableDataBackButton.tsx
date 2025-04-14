import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type Table from "metabase-lib/v1/metadata/Table";
import type { Table as TableApi } from "metabase-types/api";

export const EditTableDataBackButton = ({
  table,
}: {
  table: Table | TableApi;
}) => {
  const label = t`Back to ${table.display_name}`;

  return (
    <Tooltip label={label}>
      <Link to={Urls.browseTable(table)}>
        <ActionIcon
          variant="outline"
          radius="xl"
          size="2.625rem"
          color="border"
          aria-label={label}
        >
          <Icon c="text-dark" name="arrow_left" />
        </ActionIcon>
      </Link>
    </Tooltip>
  );
};
