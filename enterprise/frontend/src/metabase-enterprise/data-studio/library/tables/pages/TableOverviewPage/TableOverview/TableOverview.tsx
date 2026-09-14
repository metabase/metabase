import { useMemo } from "react";

import { OverviewVisualization } from "metabase/common/data-studio/components/OverviewVisualization";
import {
  useMetadataProvider,
  useQuestionFromOpts,
} from "metabase/metadata-store";
import { Flex, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Table } from "metabase-types/api";

import { DescriptionSection } from "./DescriptionSection";
import S from "./TableOverview.module.css";

type TableOverviewProps = {
  table: Table;
};

export function TableOverview({ table }: TableOverviewProps) {
  const metadataProvider = useMetadataProvider(table.db_id);
  const buildQuestion = useQuestionFromOpts();
  const card = useMemo(
    () => getCard(table, metadataProvider, buildQuestion),
    [table, metadataProvider, buildQuestion],
  );
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

function getCard(
  table: Table,
  metadataProvider: Lib.MetadataProvider,
  buildQuestion: ReturnType<typeof useQuestionFromOpts>,
) {
  const tableMetadata = Lib.tableOrCardMetadata(metadataProvider, table.id);
  if (tableMetadata == null) {
    return;
  }

  const query = Lib.queryFromTableOrCardMetadata(
    metadataProvider,
    tableMetadata,
  );
  return buildQuestion({ dataset_query: Lib.toJsQuery(query) }).card();
}
