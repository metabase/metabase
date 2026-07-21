import { useDispatch } from "metabase/redux";
import { push } from "metabase/router";
import * as Urls from "metabase/urls";
import { useListSeedsQuery } from "metabase-enterprise/api";
import type { Table } from "metabase-types/api";

import { SeedRowMenu } from "../../../seeds/components/SeedRowMenu";

import { TableMoreMenu } from "./TableMoreMenu";

// Seed-backed tables get the seed actions (replace/download/delete); everything
// else gets the standard table menu.
export function TableActionsMenu({ table }: { table: Table }) {
  const dispatch = useDispatch();
  const { data: seeds = [] } = useListSeedsQuery();
  const seed = seeds.find((s) => s.table_id === table.id);

  if (seed) {
    return (
      <SeedRowMenu
        seed={{
          model: "seed",
          id: seed.id,
          name: seed.name,
          tableId: seed.table_id,
        }}
        onDeleted={() => dispatch(push(Urls.dataStudioLibrary()))}
      />
    );
  }

  return <TableMoreMenu table={table} />;
}
