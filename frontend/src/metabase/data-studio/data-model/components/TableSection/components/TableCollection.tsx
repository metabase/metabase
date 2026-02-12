import { Link } from "react-router";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { Box } from "metabase/ui";
import type { Table } from "metabase-types/api";

import S from "./TableCollection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

type TableCollectionProps = {
  table: Table;
};

export function TableCollection({ table }: TableCollectionProps) {
  const { collection } = table;

  return (
    <>
      <TableSectionGroup title={t`This table has been published`}>
        {collection != null ? (
          <Box
            className={S.link}
            component={Link}
            to={Urls.dataStudioLibrary({ expandedIds: [collection.id] })}
            fw="bold"
          >
            {collection.name}
          </Box>
        ) : (
          <Box>{t`You don't have access to this collection`}</Box>
        )}
      </TableSectionGroup>
    </>
  );
}
