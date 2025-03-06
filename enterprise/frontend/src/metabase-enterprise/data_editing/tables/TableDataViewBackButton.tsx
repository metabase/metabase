import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { ActionIcon, Icon, Tooltip } from "metabase/ui";
import type { Database } from "metabase-types/api";

export const TableDataViewBackButton = ({
  database,
}: {
  database: Database;
}) => {
  const label = t`Back to ${database.name}`;

  return (
    <Tooltip label={label}>
      <Link to={Urls.browseDatabase(database)}>
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
