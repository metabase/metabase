import { useMemo } from "react";

import { OverviewVisualization } from "metabase/data-studio/common/components/OverviewVisualization";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Flex, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Table } from "metabase-types/api";

import { DescriptionSection } from "./DescriptionSection";
import S from "./TableOverview.module.css";

type TableOverviewProps = {
  table: Table;
};

export function TableOverview({ table }: TableOverviewProps) {
  const metadata = useSelector(getMetadata);
  const card = useMemo(() => getCard(table, metadata), [table, metadata]);
  return (
    <Flex flex={1} gap={0}>
      <Flex direction="column" flex={1} mah={700}>
        {card && <OverviewVisualization card={card} />}
      </Flex>
      <Stack flex="0 0 360px" className={S.descriptionSection} mah={700}>
        <DescriptionSection table={table} />
      </Stack>
    </Flex>
  );
}

function getCard(table: Table, metadata: Metadata) {
  const metadataProvider = Lib.metadataProvider(table.db_id, metadata);
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
  if (tableMetadata == null) {
    return;
  }

  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );
  const question = Question.create({
    dataset_query: Lib.toJsQuery(query),
    metadata,
  });
  return question.card();
}
