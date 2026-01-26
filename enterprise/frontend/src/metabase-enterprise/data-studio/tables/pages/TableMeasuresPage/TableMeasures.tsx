import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Flex } from "metabase/ui";
import { getUserCanWriteMeasures } from "metabase-enterprise/data-studio/selectors";
import type { Table } from "metabase-types/api";

import {
  EntityList,
  EntityListItem,
} from "../../../common/components/EntityList";

type TableMeasuresProps = {
  table: Table;
};

export function TableMeasures({ table }: TableMeasuresProps) {
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const measures = table.measures ?? [];
  let newButtonLabel: string | undefined;
  let newButtonUrl: string | undefined;

  if (canWriteMeasures) {
    newButtonLabel = t`New measure`;
    newButtonUrl = Urls.dataStudioPublishedTableMeasureNew(table.id);
  }

  return (
    <Flex direction="column" flex={1}>
      <EntityList
        items={measures}
        title={t`Measures`}
        emptyState={{
          icon: "sum",
          title: t`No measures yet`,
          message: t`Create a measure to define aggregations for this table.`,
        }}
        newButtonLabel={newButtonLabel}
        newButtonUrl={newButtonUrl}
        renderItem={(measure) => (
          <EntityListItem
            key={measure.id}
            name={measure.name}
            description={measure.definition_description}
            icon="sum"
            href={Urls.dataStudioPublishedTableMeasure(table.id, measure.id)}
          />
        )}
      />
    </Flex>
  );
}
