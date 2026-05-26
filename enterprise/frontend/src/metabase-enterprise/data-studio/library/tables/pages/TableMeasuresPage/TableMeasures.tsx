import { t } from "ttag";

import { trackMeasureCreateStarted } from "metabase/data-studio/analytics";
import {
  EntityList,
  EntityListItem,
} from "metabase/data-studio/common/components/EntityList";
import { getUserCanWriteMeasures } from "metabase/data-studio/selectors";
import { useSelector } from "metabase/redux";
import { Flex } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { ConcreteTableId, Table } from "metabase-types/api";

type TableMeasuresProps = {
  table: Table;
};

export function TableMeasures({ table }: TableMeasuresProps) {
  const canWriteMeasures = useSelector((state) =>
    getUserCanWriteMeasures(state, table.is_published),
  );
  const measures = table.measures ?? [];

  return (
    <Flex direction="column" flex={1}>
      <EntityList
        items={measures}
        title={t`Measures`}
        emptyState={{
          icon: "ruler",
          title: t`No measures yet`,
          message: t`Create a measure to define aggregations for this table.`,
        }}
        newButtonProps={
          canWriteMeasures
            ? {
                label: t`New measure`,
                trackClickEvent: () =>
                  trackMeasureCreateStarted(table.id as ConcreteTableId),
                url: Urls.dataStudioPublishedTableMeasureNew(table.id),
              }
            : undefined
        }
        renderItem={(measure) => (
          <EntityListItem
            key={measure.id}
            name={measure.name}
            description={measure.definition_description}
            icon="ruler"
            href={Urls.dataStudioPublishedTableMeasure(table.id, measure.id)}
          />
        )}
      />
    </Flex>
  );
}
