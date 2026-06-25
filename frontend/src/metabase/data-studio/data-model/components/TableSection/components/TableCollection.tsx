import { Link } from "react-router";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { Box } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Table } from "metabase-types/api";

import S from "./TableCollection.module.css";
import { TableSectionGroup } from "./TableSectionGroup";

type TableCollectionProps = {
  table: Table;
};

export function TableCollection({ table }: TableCollectionProps) {
  const { collection } = table;
  const { path } = useCollectionPath({ collectionId: collection?.id ?? null });

  // Expand the path down to the published collection (skipping the library
  // root, which isn't a tree node) so it's revealed instead of the root.
  const expandedIds = match({ path, collection })
    .with({ path: P.nonNullable }, ({ path }) => path.slice(1).map((c) => c.id))
    .with({ collection: P.nonNullable }, ({ collection }) => [collection.id])
    .otherwise(() => []);

  return (
    <>
      <TableSectionGroup title={t`This table has been published`}>
        {collection != null ? (
          <Box
            className={S.link}
            component={Link}
            to={Urls.dataStudioLibrary({ expandedIds })}
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
